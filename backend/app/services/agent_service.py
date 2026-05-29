"""
Agent Service — Gemini-powered conversational shopping assistant with function calling.
Uses the new google-genai SDK.
Handles: product search, style advice, size guidance, order status, returns/cancellations.
"""

import time
import json
import logging
from typing import Optional, Dict, Any, List
from collections import OrderedDict

from google import genai
from google.genai import types

from app.config import get_settings
from app.models.database import get_supabase_client
from app.models.schemas import ChatProductSuggestion
from app.services.clip_service import get_clip_service
from app.services.search_service import SearchService

logger = logging.getLogger(__name__)


# Tool function declarations for Gemini function calling
TOOL_DECLARATIONS = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="search_products",
            description="Search for fashion products by natural language description. Use this when the customer asks to find, show, or search for products.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(
                        type=types.Type.STRING,
                        description="Natural language search query describing the product",
                    ),
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_product_details",
            description="Get detailed information about a specific product by its ID.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "product_id": types.Schema(
                        type=types.Type.INTEGER,
                        description="The product ID",
                    ),
                },
                required=["product_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="check_order_status",
            description="Check the status of an order using order number or customer email.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "order_number": types.Schema(
                        type=types.Type.STRING,
                        description="The order number (e.g., ORD-001)",
                    ),
                    "customer_email": types.Schema(
                        type=types.Type.STRING,
                        description="Customer email address",
                    ),
                },
            ),
        ),
        types.FunctionDeclaration(
            name="cancel_order",
            description="Cancel an order. Only works for orders in 'processing' status. Triggers a cancellation ticket.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "order_number": types.Schema(
                        type=types.Type.STRING,
                        description="The order number to cancel",
                    ),
                    "customer_email": types.Schema(
                        type=types.Type.STRING,
                        description="The email address of the customer for verification",
                    ),
                },
                required=["order_number", "customer_email"],
            ),
        ),
        types.FunctionDeclaration(
            name="request_return",
            description="Request a return or dispute for an order. Use this when the customer wants to return an item, report a defect, or open a dispute.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "order_number": types.Schema(
                        type=types.Type.STRING,
                        description="The order number",
                    ),
                    "customer_email": types.Schema(
                        type=types.Type.STRING,
                        description="The email address of the customer for verification",
                    ),
                    "reason": types.Schema(
                        type=types.Type.STRING,
                        description="The reason for the return or dispute (e.g., 'wrong size', 'defective', 'changed mind')",
                    ),
                },
                required=["order_number", "customer_email"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_style_advice",
            description="Get styling advice for a product - what to pair it with, occasions, complementary items.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "product_id": types.Schema(
                        type=types.Type.INTEGER,
                        description="Product ID to get style advice for",
                    ),
                    "occasion": types.Schema(
                        type=types.Type.STRING,
                        description="Occasion or context (e.g., casual, formal, date night)",
                    ),
                },
                required=["product_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="attach_evidence",
            description="Attach an evidence photo URL to an open return/dispute ticket. Use this when the customer provides a photo.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "order_number": types.Schema(
                        type=types.Type.STRING,
                        description="The order number",
                    ),
                    "customer_email": types.Schema(
                        type=types.Type.STRING,
                        description="The customer's email",
                    ),
                    "evidence_url": types.Schema(
                        type=types.Type.STRING,
                        description="The URL of the uploaded evidence photo provided by the customer",
                    ),
                },
                required=["order_number", "customer_email", "evidence_url"],
            ),
        ),
        types.FunctionDeclaration(
            name="visual_search",
            description="Search for products using a product image URL. Use this when the customer uploads a photo and asks to find similar products or items matching the image. Extracts visual features from the image and searches the catalog semantically.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "image_url": types.Schema(
                        type=types.Type.STRING,
                        description="The URL of the uploaded image to search for similar products",
                    ),
                    "text_constraint": types.Schema(
                        type=types.Type.STRING,
                        description="Optional text constraint to refine the visual search (e.g., 'but not red', 'in blue color', 'for men')",
                    ),
                },
                required=["image_url"],
            ),
        ),
        types.FunctionDeclaration(
            name="search_company_policy",
            description="Search the company's policy documents. Use this when a customer asks about return policies, shipping policies, refund timelines, exchange rules, size guides, or any business policy question.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(
                        type=types.Type.STRING,
                        description="The policy-related question or topic to search for",
                    ),
                },
                required=["query"],
            ),
        ),
    ]
)

SYSTEM_PROMPT = """You are StyleSense AI, a friendly and knowledgeable fashion shopping assistant for StyleSense, a premium fashion e-commerce store.

Your personality:
- Warm, enthusiastic about fashion, but not pushy
- Give concise, helpful answers
- Use fashion terminology naturally
- Recommend products proactively when relevant

You can help customers with:
1. **Finding products**: Search for items by description, style, color, occasion, etc.
2. **Visual product search**: When a customer uploads an image (you'll see a URL in brackets like [Evidence Attached: ...]), use the visual_search tool with the image_url to find similar products. You CAN see images — use the visual_search tool.
3. **Style advice**: What goes well together, occasion-appropriate outfits, color matching
4. **Size guidance**: General sizing advice based on product category
5. **Order management**: Check order status, process cancellations/returns
6. **Company policies**: When asked about return policies, shipping, exchanges, refunds, etc., use the search_company_policy tool to retrieve accurate policy info.

Important rules:
- Always use your search tool when a customer wants to find products
- When the customer message contains "[Evidence Attached:" followed by a URL, ALWAYS use the visual_search tool with that URL as image_url
- For policy questions, ALWAYS use the search_company_policy tool before answering
- CRITICAL: When a customer asks to cancel an order, check order status, or request a return, you MUST verify they have provided their order number and email. If they have not typed these details in the chat (and they are not in the Active constraints context as a Logged In Customer), you MUST politely ask the customer for the missing parameters (e.g. "Could you please provide your order number?"). Do NOT call the tool or hallucinate/make up order numbers/emails if they are not provided!
- ORDER LIFECYCLE & RETURN ELIGIBILITY RULES:
  * Order Status 'processing': Eligible for Cancellation (cancel_order tool). NOT eligible for Returns because it hasn't shipped yet. If the customer requests a return for a processing order, explain that they can cancel it immediately for a full refund.
  * Order Status 'shipped' or 'delivered': Eligible for Returns/Exchanges (request_return tool) within 30 days. NOT eligible for Cancellation. If the customer requests a cancellation for a shipped/delivered order, explain that it has already shipped/delivered and guide them to request a return instead.
  * Return Tool Invocation: When a customer requests a return, always call the request_return tool. If they have not specified a reason yet, omit the 'reason' argument or leave it empty; the tool will create the ticket and move it to AWAITING_REASON, returning a prompt you should use to ask them for the reason. Once they provide the reason, invoke request_return again with that reason to evaluate eligibility.
  * Never mix up the two workflows: Do NOT invoke cancel_order for shipped/delivered orders, and do NOT invoke request_return for processing orders. Use the lifecycle guards returned by the tools to guide the user conversationally.
- Prices are in Bangladeshi Taka (৳)
- Be honest if you can't find exactly what they're looking for
- Suggest alternatives when exact matches aren't available
- Keep responses conversational and under 200 words unless detail is needed"""


class SessionManager:
    """Manages chat sessions with TTL, max capacity, and accumulated shopping context."""

    def __init__(self, max_sessions: int = 50, ttl_seconds: int = 3600):
        self.sessions: OrderedDict[str, dict] = OrderedDict()
        self.max_sessions = max_sessions
        self.ttl_seconds = ttl_seconds

    def get_history(self, session_id: str) -> list[types.Content]:
        """Get conversation history for a session."""
        self._cleanup_expired()

        if session_id in self.sessions:
            self.sessions[session_id]["last_access"] = time.time()
            self.sessions.move_to_end(session_id)
            return self.sessions[session_id]["history"]

        return []

    def get_shopping_context(self, session_id: str) -> dict:
        """Get or initialize the shopping context for a session."""
        self._cleanup_expired()

        if session_id not in self.sessions:
            if len(self.sessions) >= self.max_sessions:
                self.sessions.popitem(last=False)
            self.sessions[session_id] = {
                "history": [],
                "last_access": time.time(),
                "shopping_context": {
                    "gender": None,
                    "price_max": None,
                    "exclude_colors": [],
                    "exclude_types": [],
                    "category": None,
                    "color_family": None,
                    "season": None,
                    "fit": None,
                    "texture": None,
                    "usage_type": None,
                    "shown_products": [],
                    "customer_email": None,
                    "customer_name": None
                }
            }
        
        session = self.sessions[session_id]
        if "shopping_context" not in session:
            session["shopping_context"] = {
                "gender": None,
                "price_max": None,
                "exclude_colors": [],
                "exclude_types": [],
                "category": None,
                "color_family": None,
                "season": None,
                "fit": None,
                "texture": None,
                "usage_type": None,
                "shown_products": [],
                "customer_email": None,
                "customer_name": None
            }
        
        session["last_access"] = time.time()
        return session["shopping_context"]

    def add_to_history(self, session_id: str, content: types.Content):
        """Add a Content message to session history."""
        if session_id not in self.sessions:
            if len(self.sessions) >= self.max_sessions:
                self.sessions.popitem(last=False)
            self.sessions[session_id] = {
                "history": [],
                "last_access": time.time(),
                "shopping_context": {
                    "gender": None,
                    "price_max": None,
                    "exclude_colors": [],
                    "exclude_types": [],
                    "category": None,
                    "color_family": None,
                    "season": None,
                    "fit": None,
                    "texture": None,
                    "usage_type": None,
                    "shown_products": []
                }
            }

        self.sessions[session_id]["history"].append(content)
        self.sessions[session_id]["last_access"] = time.time()

    def _cleanup_expired(self):
        """Remove sessions older than TTL."""
        now = time.time()
        expired = [
            sid for sid, data in self.sessions.items()
            if now - data["last_access"] > self.ttl_seconds
        ]
        for sid in expired:
            del self.sessions[sid]


class AgentService:
    """Gemini-powered conversational agent with tool use."""

    def __init__(self):
        settings = get_settings()
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model_id = settings.gemini_model
        self.session_manager = SessionManager(
            max_sessions=settings.max_chat_sessions,
            ttl_seconds=settings.chat_session_ttl_seconds,
        )

    async def _resolve_order_number(self, order_number: Optional[str], customer_email: Optional[str]) -> Optional[str]:
        """
        Smart helper to resolve order number. If order_number is invalid/hallucinated
        but customer has exactly one order in DB, auto-resolves to that order number.
        """
        if not customer_email:
            return order_number
            
        client = get_supabase_client()
        result = client.table("orders").select("order_number").eq("customer_email", customer_email).execute()
        
        if not result.data:
            return order_number
            
        valid_orders = list(set([o["order_number"] for o in result.data]))
        
        # If the passed order number is valid, use it
        if order_number in valid_orders:
            return order_number
            
        # If the customer has exactly one order, auto-resolve to it!
        if len(valid_orders) == 1:
            return valid_orders[0]
            
        return order_number

    async def process_message(
        self,
        message: str,
        session_id: str,
        product_id: Optional[int] = None,
        customer_email: Optional[str] = None,
        customer_name: Optional[str] = None,
    ) -> tuple[str, list[ChatProductSuggestion]]:
        """Process a chat message and return reply + suggested products."""
        suggested_products = []

        # Get or initialize session shopping context
        session_context = self.session_manager.get_shopping_context(session_id)

        # Store logged-in user profile details
        if customer_email:
            session_context["customer_email"] = customer_email
        if customer_name:
            session_context["customer_name"] = customer_name

        # Build context
        context = message
        if product_id:
            try:
                client = get_supabase_client()
                result = client.table("products").select("*").eq("id", product_id).single().execute()
                if result.data:
                    p = result.data
                    context = f"[Customer is viewing: {p['title']} - {p['category']} - ৳{p['price']}]\n\n{message}"
                    # Keep track that they have seen this specific product
                    if p["id"] not in session_context.get("shown_products", []):
                        session_context.setdefault("shown_products", []).append(p["id"])
            except Exception:
                pass

        # Format active constraints for dynamic system prompt
        active_constraints = []
        if session_context.get("gender"):
            active_constraints.append(f"Gender: {session_context['gender']}")
        if session_context.get("price_max"):
            active_constraints.append(f"Max Budget: ৳{session_context['price_max']}")
        if session_context.get("exclude_colors"):
            active_constraints.append(f"Excluded Colors: {', '.join(session_context['exclude_colors'])}")
        if session_context.get("exclude_types"):
            active_constraints.append(f"Excluded Styles: {', '.join(session_context['exclude_types'])}")
        if session_context.get("category"):
            active_constraints.append(f"Category: {session_context['category']}")
        if session_context.get("color_family"):
            active_constraints.append(f"Color: {session_context['color_family']}")
        if session_context.get("customer_email"):
            active_constraints.append(f"Logged In Customer: {session_context.get('customer_name') or 'Customer'} ({session_context['customer_email']})")

        dynamic_system_prompt = SYSTEM_PROMPT
        if active_constraints:
            dynamic_system_prompt += "\n\nActive search filters for this customer session:\n" + "\n".join(f"- {c}" for c in active_constraints)

        # Get conversation history
        history = self.session_manager.get_history(session_id)

        # Build the user message content
        user_content = types.Content(
            role="user",
            parts=[types.Part.from_text(text=context)],
        )

        # Build config with tools
        config = types.GenerateContentConfig(
            system_instruction=dynamic_system_prompt,
            tools=[TOOL_DECLARATIONS],
            temperature=0.7,
        )

        # Full contents = history + new message
        contents = list(history) + [user_content]

        # Send to Gemini with retry for rate limits
        import asyncio
        response = None
        gemini_failed = False
        for attempt in range(2):
            try:
                response = self.client.models.generate_content(
                    model=self.model_id,
                    contents=contents,
                    config=config,
                )
                break  # success
            except Exception as e:
                error_str = str(e)
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    if attempt == 0:
                        await asyncio.sleep(3)
                    else:
                        gemini_failed = True
                else:
                    raise  # Non-rate-limit errors propagate immediately

        # ── OpenRouter Fallback ──
        if gemini_failed or response is None:
            return await self._process_with_openrouter(context, session_id, user_content, dynamic_system_prompt)

        # Handle tool calls iteratively
        max_rounds = 3
        for _ in range(max_rounds):
            if not response.candidates or not response.candidates[0].content.parts:
                break

            # Check for function calls
            function_calls = [
                part for part in response.candidates[0].content.parts
                if part.function_call is not None
            ]

            if not function_calls:
                break

            # Execute each function call
            function_responses = []
            for fc_part in function_calls:
                fn_name = fc_part.function_call.name
                fn_args = dict(fc_part.function_call.args) if fc_part.function_call.args else {}

                result_str, products = await self._execute_tool(fn_name, fn_args, session_id)
                suggested_products.extend(products)

                function_responses.append(
                    types.Part.from_function_response(
                        name=fn_name,
                        response={"result": result_str},
                    )
                )

            # Add assistant message (with function calls) and function responses to contents
            contents.append(response.candidates[0].content)
            contents.append(types.Content(
                role="user",
                parts=function_responses,
            ))

            # Send tool results back to Gemini (with retry, fallback to OpenRouter)
            tool_response = None
            for attempt in range(2):
                try:
                    tool_response = self.client.models.generate_content(
                        model=self.model_id,
                        contents=contents,
                        config=config,
                    )
                    break
                except Exception as e:
                    error_str = str(e)
                    if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                        if attempt == 0:
                            await asyncio.sleep(3)
                    else:
                        raise
            if tool_response is None:
                # Fall back to OpenRouter for the final response with tool results
                tool_results_text = "\n".join(
                    f"[Tool {fr.function_response.name} returned: {json.dumps(fr.function_response.response)}]"
                    for fr in function_responses
                    if hasattr(fr, "function_response")
                )
                openrouter_reply = await self._openrouter_simple_reply(
                    context, tool_results_text, dynamic_system_prompt
                )
                self.session_manager.add_to_history(session_id, user_content)
                model_content = types.Content(
                    role="model",
                    parts=[types.Part.from_text(text=openrouter_reply)],
                )
                self.session_manager.add_to_history(session_id, model_content)
                return openrouter_reply, suggested_products
            response = tool_response

        # Extract final text response
        reply = ""
        if response.candidates and response.candidates[0].content.parts:
            reply = "".join(
                part.text for part in response.candidates[0].content.parts
                if hasattr(part, "text") and part.text
            )

        if not reply:
            reply = "I'm sorry, I couldn't process that request. Could you try rephrasing?"

        # Save to history
        self.session_manager.add_to_history(session_id, user_content)
        if response.candidates and response.candidates[0].content:
            model_content = types.Content(
                role="model",
                parts=[types.Part.from_text(text=reply)],
            )
            self.session_manager.add_to_history(session_id, model_content)

        return reply, suggested_products

    async def _process_with_openrouter(
        self, context: str, session_id: str, user_content, dynamic_system_prompt: str
    ) -> tuple[str, list[ChatProductSuggestion]]:
        """
        Full OpenRouter fallback: handles the conversation + manual tool dispatch.
        """
        from app.services.openrouter_service import get_openrouter_service
        or_svc = get_openrouter_service()

        suggested_products = []

        # Build OpenRouter-compatible conversation history
        or_history = []
        history = self.session_manager.get_history(session_id)
        for msg in history:
            role = "user" if msg.role == "user" else "assistant"
            text = ""
            for part in msg.parts:
                if hasattr(part, "text") and part.text:
                    text += part.text
            if text:
                or_history.append({"role": role, "content": text})

        # Step 1: Ask OpenRouter if it needs to call a tool
        tool_prompt = dynamic_system_prompt + """

CRITICAL: You are an agent equipped with tool-use capabilities. When a user request requires calling a tool to fetch data or perform an action (e.g., search_products, check_order_status, cancel_order, request_return, visual_search, search_company_policy, get_style_advice), you MUST respond with ONLY a raw JSON object and ABSOLUTELY NOTHING ELSE. No conversational prefaces, no conversational explanations, no code blocks, and no markdown wrapping.

If you decide to call a tool, your output MUST be EXACTLY a valid JSON object in the following format:
{"tool": "tool_name", "args": {"param1": "value1"}}

Here are the specific tools and when you MUST call them:
1. "search_products": Use this when the user wants to search, find, show, view, browse, or list products. Args: {"query": "<query string>"}
2. "cancel_order": Use this when the user requests to cancel an order. Args: {"order_number": "<order_number>", "customer_email": "<email>"}
3. "check_order_status": Use this when the user wants to check the status or details of their order. Args: {"order_number": "<order_number>", "customer_email": "<email>"}
4. "request_return": Use this when the user wants to return an item or request a refund/dispute. Args: {"order_number": "<order_number>", "customer_email": "<email>", "reason": "<optional_reason>"}
5. "visual_search": Use this when the user provides/uploads an image URL to find similar items. Args: {"image_url": "<url>", "text_constraint": "<optional_refinement>"}
6. "search_company_policy": Use this when the user asks about store rules, shipping times, return periods, custom fees, or policies. Args: {"query": "<search_query>"}
7. "get_style_advice": Use this to get style recommendations/pairing suggestions for a specific product ID. Args: {"product_id": <int_id>, "occasion": "<casual/formal/etc>"}

If (and ONLY if) the customer's message is a simple conversational greeting, style question without specific products, or general chat that does NOT require any backend action/information retrieval, then respond naturally to the customer in plain text without any JSON.

DO NOT hallucinate a conversational response if you need a tool. If a tool is required, write the JSON object and stop immediately. No conversational filler, no explanation!"""

        messages = [{"role": "system", "content": tool_prompt}]
        messages.extend(or_history)
        messages.append({"role": "user", "content": context})

        first_response = await or_svc.chat(messages, temperature=0.7, max_tokens=1024)

        # Check if it's a tool call
        tool_result = None
        try:
            cleaned = first_response.strip()
            if "```" in cleaned:
                import re
                code_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
                if code_match:
                    cleaned = code_match.group(1).strip()
                else:
                    cleaned = cleaned.replace("```json", "").replace("```", "").strip()

            if not (cleaned.startswith("{") and cleaned.endswith("}")):
                import re
                json_match = re.search(r"(\{.*?\})", cleaned, re.DOTALL)
                if json_match:
                    cleaned = json_match.group(1).strip()

            parsed = json.loads(cleaned)
            if isinstance(parsed, dict) and "tool" in parsed:
                fn_name = parsed["tool"]
                fn_args = parsed.get("args", {})
                logger.info(f"OpenRouter tool call: {fn_name}({fn_args})")
                tool_result_str, products = await self._execute_tool(fn_name, fn_args, session_id)
                suggested_products.extend(products)
                tool_result = tool_result_str
        except Exception as e:
            logger.debug(f"Failed to parse OpenRouter response as tool call: {e}")

        if tool_result is not None:
            # Step 2: Feed tool results back to get final response
            messages.append({"role": "assistant", "content": first_response})
            messages.append({
                "role": "user",
                "content": f"[Tool result]: {tool_result}\n\nNow respond to the customer based on this tool result. Be helpful and conversational.",
            })
            final_response = await or_svc.chat(messages, temperature=0.7, max_tokens=1024)
        else:
            final_response = first_response

        # Save to history
        self.session_manager.add_to_history(session_id, user_content)
        model_content = types.Content(
            role="model",
            parts=[types.Part.from_text(text=final_response)],
        )
        self.session_manager.add_to_history(session_id, model_content)

        return final_response, suggested_products

    async def _openrouter_simple_reply(self, user_message: str, tool_context: str, dynamic_system_prompt: str) -> str:
        """Simple OpenRouter reply with tool context already available."""
        from app.services.openrouter_service import get_openrouter_service
        or_svc = get_openrouter_service()

        messages = [
            {"role": "system", "content": dynamic_system_prompt},
            {
                "role": "user",
                "content": f"{user_message}\n\n[Tool Results]:\n{tool_context}\n\nRespond to the customer based on the tool results above.",
            },
        ]
        return await or_svc.chat(messages, temperature=0.7, max_tokens=1024)

    async def _execute_tool(
        self, fn_name: str, fn_args: dict, session_id: str
    ) -> tuple[str, list[ChatProductSuggestion]]:
        """Execute a tool function and return result + suggested products."""
        products = []

        try:
            if fn_name == "search_products":
                return await self._tool_search(fn_args.get("query", ""), products, session_id)
            elif fn_name == "get_product_details":
                return await self._tool_get_product(int(fn_args.get("product_id", 0)))
            elif fn_name == "check_order_status":
                return await self._tool_check_order(
                    fn_args.get("order_number"),
                    fn_args.get("customer_email"),
                )
            elif fn_name == "cancel_order":
                return await self._tool_cancel_order(fn_args.get("order_number", ""), fn_args.get("customer_email", ""))
            elif fn_name == "request_return":
                return await self._tool_request_return(fn_args.get("order_number", ""), fn_args.get("customer_email", ""), fn_args.get("reason", ""))
            elif fn_name == "attach_evidence":
                return await self._tool_attach_evidence(fn_args.get("order_number", ""), fn_args.get("customer_email", ""), fn_args.get("evidence_url", ""))
            elif fn_name == "get_style_advice":
                return await self._tool_style_advice(
                    int(fn_args.get("product_id", 0)),
                    fn_args.get("occasion", "casual"),
                )
            elif fn_name == "visual_search":
                return await self._tool_visual_search(
                    fn_args.get("image_url", ""),
                    fn_args.get("text_constraint"),
                    session_id,
                )
            elif fn_name == "search_company_policy":
                return await self._tool_search_policy(fn_args.get("query", ""))
            else:
                return f"Unknown tool: {fn_name}", []
        except Exception as e:
            return f"Error executing {fn_name}: {str(e)}", []

    async def _tool_search(
        self, query: str, products: list, session_id: str
    ) -> tuple[str, list[ChatProductSuggestion]]:
        """Search products by text query with session context accumulation."""
        from app.services.search_pipeline import SearchPipeline
        pipeline = SearchPipeline()

        session_context = self.session_manager.get_shopping_context(session_id)

        # Run 5-stage pipeline with session context
        results = await pipeline.execute_search(query=query, limit=5, session_context=session_context)

        if not results:
            return "No products found matching that description.", []

        suggested = []
        result_text = f"Found {len(results)} products matching details:\n"
        for r in results:
            match_reason = r.get("match_reason", "")
            result_text += f"- [{r['id']}] {r['title']} (BDT {r['price']}, {r['category']}, {r.get('color', 'N/A')}) - {match_reason}\n"
            suggested.append(ChatProductSuggestion(
                id=r["id"],
                title=r["title"],
                price=float(r["price"]),
                image_url=r.get("image_url"),
                category=r["category"],
            ))

        return result_text, suggested

    async def _tool_get_product(self, product_id: int) -> tuple[str, list]:
        """Get product details."""
        client = get_supabase_client()
        result = client.table("products").select("*").eq("id", product_id).single().execute()

        if not result.data:
            return f"Product {product_id} not found.", []

        p = result.data
        return (
            f"Product: {p['title']}\n"
            f"Category: {p['category']}\n"
            f"Color: {p.get('color', 'N/A')}\n"
            f"Price: BDT {p['price']}\n"
            f"Description: {p.get('description', 'N/A')}\n"
            f"Season: {p.get('season', 'N/A')}\n"
            f"Usage: {p.get('usage_type', 'N/A')}"
        ), []

    async def _tool_check_order(
        self, order_number: Optional[str], customer_email: Optional[str]
    ) -> tuple[str, list]:
        """Check order status."""
        client = get_supabase_client()

        if order_number:
            result = client.table("orders").select("*").eq("order_number", order_number).execute()
        elif customer_email:
            result = client.table("orders").select("*").eq("customer_email", customer_email).execute()
        else:
            return "Please provide an order number or email address.", []

        if not result.data:
            return "No orders found with that information.", []

        orders_text = ""
        for o in result.data:
            orders_text += (
                f"Order {o['order_number']}:\n"
                f"  Status: {o['status']}\n"
                f"  Total: BDT {o['total_price']}\n"
                f"  Placed: {o['created_at']}\n\n"
            )

        return orders_text, []

    async def _tool_cancel_order(self, order_number: str, customer_email: str) -> tuple[str, list]:
        """Cancel an order via ticket workflow."""
        if not customer_email:
            return "Please provide your email address to cancel an order.", []
            
        resolved_order_number = await self._resolve_order_number(order_number, customer_email)
        if not resolved_order_number:
            return "Please provide your order number to cancel an order.", []
            
        client = get_supabase_client()
        result = client.table("orders").select("*").eq("order_number", resolved_order_number).execute()

        if not result.data:
            return f"Order {resolved_order_number} not found.", []

        orders = result.data
        if orders[0]["customer_email"] != customer_email:
            return "The email provided does not match the order records.", []

        # Smart lifecycle guard: if order has already shipped or delivered, cancel is blocked, suggest returns
        order_status = orders[0]["status"]
        if order_status in ["shipped", "delivered"]:
            return (
                f"Order {resolved_order_number} has already been {order_status} and cannot be cancelled. "
                "However, since it is within the 30-day window, you can request a RETURN. "
                "Would you like me to initiate a return request for you instead?", []
            )

        from app.services.ticket_workflow import get_ticket_service
        ticket_svc = get_ticket_service()
        ticket = ticket_svc.create_ticket(orders[0]["id"], customer_email, "cancellation")
        ticket = await ticket_svc.process_eligibility(ticket["id"])
        
        if ticket["status"] == "APPROVED":
            client.table("orders").update({"status": "cancelled"}).eq("order_number", resolved_order_number).execute()
            return f"Order {resolved_order_number} has been cancelled successfully. All items in the order have been cancelled.", []
        else:
            return f"Cancellation request could not be automatically approved. Status: {ticket['status']}. Notes: {ticket.get('resolution_notes', 'N/A')}", []

    async def _tool_request_return(self, order_number: str, customer_email: str, reason: Optional[str] = None) -> tuple[str, list]:
        """Request a return via ticket workflow."""
        if not customer_email:
            return "Please provide your email address to request a return.", []
            
        resolved_order_number = await self._resolve_order_number(order_number, customer_email)
        if not resolved_order_number:
            return "Please provide the order number for return.", []
            
        client = get_supabase_client()
        result = client.table("orders").select("*").eq("order_number", resolved_order_number).execute()

        if not result.data:
            return f"Order {resolved_order_number} not found.", []

        order = result.data[0]
        if order["customer_email"] != customer_email:
            return "The email provided does not match the order records.", []

        # Smart lifecycle guard: if order is still processing and hasn't shipped, returns are blocked, suggest cancel
        order_status = order["status"]
        if order_status == "processing":
            return (
                f"Order {resolved_order_number} is still processing and has not been shipped yet. "
                "Instead of waiting to return it, you can CANCEL it now for an immediate refund. "
                "Would you like to cancel the order instead?", []
            )

        from app.services.ticket_workflow import get_ticket_service
        ticket_svc = get_ticket_service()
        
        ticket = ticket_svc.create_ticket(order["id"], customer_email, "return", reason=reason or "")
        ticket = await ticket_svc.process_eligibility(ticket["id"])
        
        if ticket["status"] == "APPROVED":
            return f"Good news! Your return for {resolved_order_number} has been automatically approved.", []
        elif ticket["status"] == "AWAITING_REASON":
            return f"To process your return for {resolved_order_number}, please let me know the reason for the return (e.g., wrong size, defective, change of mind).", []
        elif ticket["status"] == "AWAITING_EVIDENCE":
            return f"I need a bit more information for this return request. Please upload a photo of the item using the attachment icon.", []
        elif ticket["status"] == "UNDER_REVIEW":
            return f"Your return request for {resolved_order_number} has been escalated for review. A team member will look at it shortly.", []
        elif ticket["status"] == "INELIGIBLE":
            return f"I'm sorry, but this order is not eligible for return. Reason: {ticket.get('resolution_notes', 'N/A')}", []
        else:
            return f"Return request is in status: {ticket['status']}.", []

    async def _tool_attach_evidence(self, order_number: str, customer_email: str, evidence_url: str) -> tuple[str, list]:
        """Attach evidence to an open ticket."""
        if not customer_email or not evidence_url:
            return "Missing required information to attach evidence.", []

        resolved_order_number = await self._resolve_order_number(order_number, customer_email)
        if not resolved_order_number:
            return "Please provide the order number to attach evidence.", []

        client = get_supabase_client()
        result = client.table("orders").select("*").eq("order_number", resolved_order_number).execute()
        if not result.data or result.data[0]["customer_email"] != customer_email:
            return "Order not found or email does not match.", []

        order = result.data[0]
        from app.services.ticket_workflow import get_ticket_service
        ticket_svc = get_ticket_service()
        ticket = ticket_svc.get_open_ticket_for_order(order["id"])
        
        if not ticket:
            return "No open ticket found for this order.", []
            
        updated_ticket = ticket_svc.attach_evidence(ticket["id"], evidence_url)
        return f"Evidence successfully attached. The ticket status is now {updated_ticket['status']}. A team member will review it.", []

    async def _tool_style_advice(
        self, product_id: int, occasion: str
    ) -> tuple[str, list]:
        """Get style advice for a product."""
        client = get_supabase_client()
        result = client.table("products").select("*").eq("id", product_id).single().execute()

        if not result.data:
            return f"Product {product_id} not found.", []

        p = result.data
        from app.services.gemini_service import GeminiService
        gemini_svc = GeminiService()
        advice = await gemini_svc.generate_style_advice(
            f"{p['title']} - {p.get('description', '')} - {p.get('color', '')} {p['category']}",
            occasion,
        )
        return advice, []

    async def _tool_visual_search(
        self, image_url: str, text_constraint: Optional[str] = None, session_id: Optional[str] = None
    ) -> tuple[str, list[ChatProductSuggestion]]:
        """Search products using an image URL with optional text constraint and session context."""
        import requests as http_requests
        from app.services.search_pipeline import SearchPipeline
        pipeline = SearchPipeline()

        # Download image bytes from the URL
        try:
            resp = http_requests.get(image_url, timeout=15)
            resp.raise_for_status()
            image_bytes = resp.content
        except Exception as e:
            return f"Could not download the image: {str(e)}", []

        session_context = None
        if session_id:
            session_context = self.session_manager.get_shopping_context(session_id)

        # Run unified 5-stage search pipeline with image and optional constraint
        results = await pipeline.execute_search(
            query=text_constraint,
            image_bytes=image_bytes,
            limit=5,
            session_context=session_context
        )

        if not results:
            return "No visually similar products found matching the criteria.", []

        suggested = []
        result_text = f"Found {len(results)} visually similar products matching details:\n"
        for r in results:
            match_reason = r.get("match_reason", "")
            result_text += f"- [{r['id']}] {r['title']} (BDT {r['price']}, {r['category']}, {r.get('color', 'N/A')}) - {match_reason}\n"
            suggested.append(ChatProductSuggestion(
                id=r["id"],
                title=r["title"],
                price=float(r["price"]),
                image_url=r.get("image_url"),
                category=r["category"],
            ))

        return result_text, suggested

    async def _tool_search_policy(self, query: str) -> tuple[str, list]:
        """Search company policy documents using RAG."""
        try:
            from app.services.policy_rag_service import PolicyRAGService
            rag_svc = PolicyRAGService()
            results = await rag_svc.search(query, top_k=3)

            if not results:
                return "No relevant policy information found for that question.", []

            context = "Relevant company policy sections:\n\n"
            for i, chunk in enumerate(results, 1):
                context += f"--- Section {i} ---\n{chunk['content']}\n\n"

            return context, []
        except Exception as e:
            return f"Policy search unavailable: {str(e)}", []
