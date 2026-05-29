"""
Ticket Workflow Service for Agent Commerce Operations.
Handles state transitions, eligibility checks, and human escalation for Returns, Disputes, and Cancellations.
"""

from typing import Dict, Any, Optional
from datetime import datetime, timezone, timedelta

from app.models.database import get_supabase_client
from app.config import get_settings


class TicketWorkflowService:
    def __init__(self):
        self.client = get_supabase_client()

    def get_ticket(self, ticket_id: int) -> Optional[Dict[str, Any]]:
        result = self.client.table("tickets").select("*").eq("id", ticket_id).single().execute()
        return result.data if result.data else None

    def get_open_ticket_for_order(self, order_id: int, ticket_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Returns the active ticket for an order if one exists, excluding completed/rejected/ineligible terminal states."""
        query = self.client.table("tickets").select("*").eq("order_id", order_id).neq("status", "COMPLETED").neq("status", "REJECTED").neq("status", "INELIGIBLE")
        if ticket_type:
            query = query.eq("type", ticket_type)
        result = query.execute()
        return result.data[0] if result.data else None

    def create_ticket(self, order_id: int, customer_email: str, ticket_type: str, reason: str = "") -> Dict[str, Any]:
        """Creates a new ticket in the REQUESTED state."""
        existing = self.get_open_ticket_for_order(order_id, ticket_type)
        if existing:
            # If the existing ticket is awaiting a reason, and a reason is now provided, update it and reset status to REQUESTED
            if existing["status"] == "AWAITING_REASON" and reason:
                existing = self.update_ticket(existing["id"], {"reason": reason, "status": "REQUESTED"})
            return existing

        data = {
            "order_id": order_id,
            "customer_email": customer_email,
            "type": ticket_type,
            "reason": reason,
            "status": "REQUESTED"
        }
        result = self.client.table("tickets").insert(data).execute()
        return result.data[0]

    async def process_eligibility(self, ticket_id: int) -> Dict[str, Any]:
        """
        Runs eligibility rules. For example, returns are only allowed within 7 days of order.
        Moves status to AWAITING_REASON, AWAITING_EVIDENCE, UNDER_REVIEW, or INELIGIBLE.
        """
        ticket = self.get_ticket(ticket_id)
        if not ticket or ticket["status"] != "REQUESTED":
            return ticket

        order_res = self.client.table("orders").select("*").eq("id", ticket["order_id"]).single().execute()
        order = order_res.data

        if ticket["type"] == "cancellation":
            # Can only cancel if processing
            if order["status"] == "processing":
                return self.update_status(ticket_id, "APPROVED", resolution_notes="Auto-approved cancellation.")
            else:
                return self.update_status(ticket_id, "INELIGIBLE", resolution_notes="Order already shipped or delivered.")
        
        elif ticket["type"] == "return":
            # Check 30-day return policy and 7-day auto-approval window
            created_at = datetime.fromisoformat(order["created_at"].replace("Z", "+00:00"))
            time_elapsed = datetime.now(timezone.utc) - created_at
            
            if time_elapsed > timedelta(days=30):
                return self.update_status(ticket_id, "INELIGIBLE", resolution_notes="Return window expired (30 days).")
            
            elif time_elapsed > timedelta(days=7):
                # Between 7 and 30 days: eligible but escalated for manual review per policy
                self.update_ticket(ticket_id, {
                    "resolution_notes": "Return request received between 7 and 30 days of purchase. Escalated for manual support review per company policy."
                })
                return self.update_status(ticket_id, "UNDER_REVIEW")
            
            # Within 7 days: standard automated evaluation
            if not ticket["reason"]:
                return self.update_status(ticket_id, "AWAITING_REASON")
            else:
                return await self.evaluate_reason(ticket_id, ticket["reason"])
                
        elif ticket["type"] == "dispute":
            return self.update_status(ticket_id, "AWAITING_REASON")

        return ticket

    async def evaluate_reason(self, ticket_id: int, reason: str) -> Dict[str, Any]:
        """Evaluates the reason provided by the customer using LLM reasoning."""
        self.update_ticket(ticket_id, {"reason": reason})
        ticket = self.get_ticket(ticket_id)
        
        import json
        from app.services.gemini_service import get_gemini_service
        gemini_svc = get_gemini_service()
        
        needs_evidence = False
        explanation = ""
        try:
            res_json_str = await gemini_svc.evaluate_evidence_necessity(reason)
            res_data = json.loads(res_json_str)
            needs_evidence = bool(res_data.get("needs_evidence", False))
            explanation = res_data.get("explanation", "")
        except Exception as e:
            # Fallback to keyword matching if LLM fails
            lower_reason = reason.lower()
            needs_evidence = any(word in lower_reason for word in ["defective", "broken", "wrong", "different", "damaged"])
            explanation = f"Fallback keyword check. Reason: {reason}. Error: {str(e)}"
            
        resolution_notes = f"LLM Assessment: {explanation}" if explanation else None
        
        if needs_evidence and not ticket.get("evidence_url"):
            if resolution_notes:
                self.update_ticket(ticket_id, {"resolution_notes": resolution_notes})
            return self.update_status(ticket_id, "AWAITING_EVIDENCE")
            
        # If high risk or needs evidence, escalate
        if needs_evidence:
            return self.update_status(ticket_id, "UNDER_REVIEW", resolution_notes=resolution_notes)
            
        # Low risk return (changed mind, wrong size)
        if ticket["type"] == "return":
            order_res = self.client.table("orders").select("total_price").eq("id", ticket["order_id"]).single().execute()
            if order_res.data and float(order_res.data["total_price"]) < 2000:
                return self.update_status(ticket_id, "APPROVED", resolution_notes=resolution_notes or "Auto-approved low risk return.")
            else:
                return self.update_status(ticket_id, "UNDER_REVIEW", resolution_notes=resolution_notes)
                
        return self.update_status(ticket_id, "UNDER_REVIEW", resolution_notes=resolution_notes)

    def attach_evidence(self, ticket_id: int, evidence_url: str) -> Dict[str, Any]:
        self.update_ticket(ticket_id, {"evidence_url": evidence_url})
        return self.update_status(ticket_id, "UNDER_REVIEW")

    def update_status(self, ticket_id: int, new_status: str, resolution_notes: str = None) -> Dict[str, Any]:
        updates = {"status": new_status}
        if resolution_notes:
            updates["resolution_notes"] = resolution_notes
        return self.update_ticket(ticket_id, updates)

    def update_ticket(self, ticket_id: int, updates: Dict[str, Any]) -> Dict[str, Any]:
        result = self.client.table("tickets").update(updates).eq("id", ticket_id).execute()
        return result.data[0]

def get_ticket_service() -> TicketWorkflowService:
    return TicketWorkflowService()
