\## The Problem With Naive Embedding Search



Most people build this wrong. They take the raw query, embed it directly, run vector search, done.



This breaks for real human language:



```

"cozy pistachio waffle knit, not oversized"



Problems:

\- "pistachio" is not in any product. The color is called "Mint Green"

\- "not oversized" — negation does not work in embedding space

&#x20; "not oversized" and "oversized" are mathematically close, not opposite

\- "cozy" is a vibe word, not an attribute

\- The embedding bundles all of this together and loses precision

```



Raw embedding search works well for clean queries. It fails for the way humans actually talk.



\---



\## The Right Architecture — Three Stages



```

Human Query

&#x20;   ↓

Stage 1 — UNDERSTAND     (Gemini reads the query, extracts meaning)

&#x20;   ↓

Stage 2 — SEARCH         (two parallel paths, then fused)

&#x20;   ↓

Stage 3 — RANK           (reorder by relevance, apply constraints)

&#x20;   ↓

Results

```



\---



\## Stage 1 — Query Understanding (Gemini)



Before any embedding or search happens, Gemini reads the raw human query and converts it into a structured understanding.



```

Input: "cozy pistachio waffle knit for winter, not oversized, 

&#x20;       something my girlfriend would love"



Gemini outputs:

{

&#x20; "intent": "product\_search",

&#x20; "category": \["Sweaters", "Cardigans"],

&#x20; "color\_family": \["Mint Green", "Sage Green", "Light Green", "Olive"],

&#x20; "texture": \["waffle knit", "knit"],

&#x20; "fit": "relaxed to slim",          ← "not oversized" resolved

&#x20; "fit\_exclude": "oversized",

&#x20; "season": "Winter",

&#x20; "gender": "Women",                 ← "girlfriend" implies this

&#x20; "vibe": \["cozy", "casual", "soft"],

&#x20; "price\_max": null,

&#x20; "enriched\_query": "relaxed fit waffle knit sweater in mint or sage green, 

&#x20;                    casual winter style, feminine"

}

```



This step does four things raw embedding cannot do:



\*\*Color alias resolution\*\* — "pistachio" → "Mint Green, Sage Green, Light Green". The database has "Mint Green." Gemini knows pistachio and mint are the same color family.



\*\*Negation handling\*\* — "not oversized" → fit preference for relaxed-to-slim. The word "not" is ignored in embedding math. Gemini understands it linguistically.



\*\*Vibe expansion\*\* — "cozy" → soft texture, knit fabric, winter season. Vague emotional words become searchable attributes.



\*\*Context inference\*\* — "my girlfriend" → gender: Women. Implicit meaning extracted without the customer having to specify.



\---



\## Stage 2 — Dual Path Search



Two searches run in parallel. Results are fused.



\*\*Path A — Semantic Vector Search\*\*



Take the `enriched\_query` from Stage 1. Encode with text-embedding-004. Run pgvector cosine similarity against stored `combined\_embeddings`.



Returns: products ranked by visual and semantic similarity to the enriched description.



\*\*Path B — Attribute Filter Search\*\*



Take the structured attributes from Stage 1. Run a SQL query using extracted fields.



```sql

SELECT \* FROM products

WHERE

&#x20; category = ANY(\['Sweaters', 'Cardigans'])

&#x20; AND color ILIKE ANY(\['%Mint%', '%Sage%', '%Green%', '%Olive%'])

&#x20; AND gender IN ('Women', 'Unisex')

&#x20; AND season IN ('Winter', NULL)

```



Returns: products that match the hard attributes, regardless of embedding similarity.



\*\*Fusion\*\*



```

Products in BOTH paths → highest priority, score boosted

Products in Path A only → semantic match, medium priority

Products in Path B only → attribute match, lower priority

Deduplicate, merge into single ranked list

```



Why both paths matter:



Path A alone misses products where the embedding is slightly off but the attributes clearly match. Path B alone misses products where the color name is slightly different but visually identical. Together they cover each other's blind spots.



\---



\## Stage 3 — Hard Constraint Filtering and Final Ranking



After fusion, apply constraints that cannot be overridden by relevance scores:



```

Remove: out of stock items

Remove: price > customer's stated maximum

Remove: wrong gender if customer was explicit ("for my girlfriend" is soft,

&#x20;       "men's only" is hard)

Keep:   is\_corrupted items — their embedding reflects reality, search is correct

```



Final ranking signal:



```

final\_score = 

&#x20; (0.5 × semantic\_similarity\_score)

\+ (0.3 × attribute\_match\_count / total\_attributes)

\+ (0.2 × popularity\_score)          ← can be mock for now

```



Return top 10.



\---



\## When Search Happens Through Agent Chat



The agent chat adds one more layer — conversation context.



```

Turn 1:

Customer: "show me something cozy in green"

Agent: \[shows 4 green knit sweaters]



Turn 2:

Customer: "do you have it in black?"



Raw query "do you have it in black?" means nothing to a search engine.

"It" refers to the sweater shown in Turn 1.

```



Before Stage 1 runs, a context resolution step prepends relevant history:



```

Resolved query:

"waffle knit sweater similar to the sage green one shown, but in black"



Now Stage 1 runs on this resolved query and finds black knit sweaters.

```



The agent maintains conversation history and injects it into every search call it makes internally. This is what makes it feel like a real conversation rather than isolated keyword lookups.



\---



\## Special Cases



\*\*Comparative queries:\*\*

"Something like this but cheaper" → take current product's visual\_description, add price constraint, run search.



\*\*Negative queries:\*\*

"Not that brand, not formal, nothing too bright" → Gemini converts each "not" into an exclusion filter or embedding direction adjustment. Products matching excluded terms are downranked.



\*\*Incomplete queries:\*\*

"Green" alone → insufficient. System returns results but agent asks a clarifying question in parallel: "Any particular style you're looking for? Sweaters, dresses, something else?"



\*\*Ambiguous queries:\*\*

"Something nice for a party" "help me to solve this python programming debug" → Gemini flags low confidence on category. Runs broad search across Dresses, Shirts, Ethnic wear. Returns diverse results. Agent says "Here are some options across different styles — let me know if you want something more specific." 



\---



\## The Complete Flow as One Picture



```

Human types or says anything

&#x20;           ↓

&#x20;    Is this a search intent?

&#x20;    (Gemini classifies intent)

&#x20;    ├── No → handle as conversation (agent responds without searching)

&#x20;    └── Yes → continue

&#x20;           ↓

&#x20;    Context resolution

&#x20;    (inject conversation history if agent chat)

&#x20;           ↓

&#x20;    Stage 1: Gemini query understanding

&#x20;    → structured attributes + enriched\_query string

&#x20;           ↓

&#x20;    Stage 2: Dual path search (parallel)

&#x20;    Path A: embed enriched\_query → pgvector

&#x20;    Path B: SQL filter on structured attributes

&#x20;           ↓

&#x20;    Fusion of both result sets

&#x20;           ↓

&#x20;    Stage 3: Hard constraint filtering

&#x20;    → price, stock, gender hard filters applied

&#x20;           ↓

&#x20;    Final ranking by fused score

&#x20;           ↓

&#x20;    Top 10 results returned

&#x20;    + match explanation ("matched on: color, texture, fit")

```



\---



All search queries — whether typed in the search bar or sent through agent chat — pass through a three-stage pipeline before any database query runs. Stage 1 is Gemini query understanding which resolves color aliases, handles negation, expands vague terms, infers implicit attributes, and produces a structured query object alongside an enriched search string. Stage 2 runs two parallel searches — semantic vector search using the enriched string and attribute filter search using the structured fields — then fuses the results. Stage 3 applies hard constraints and final ranking. Raw queries never hit the database directly.





































\####



A real agentic system for commerce is not a chatbot that pretends to do things. It has states, rules, validations, escalations, and sometimes a human who must approve before anything happens.



\---



\## The Problem With Simple Agent Design



What we planned before was naive:



```

Customer: "I want to return my order"

Agent: calls update\_order(order\_id, "return")

Done.

```



No verification. No eligibility check. No evidence. No approval. Any customer can cancel or return anything at any time by just typing a message. That is not a real system.



\---



\## How Real Commerce Operations Work



Every return, dispute, or cancellation in a real store goes through a lifecycle. It is not a single action. It is a process with stages.



```

RETURN LIFECYCLE:



Customer requests return

&#x20;       ↓

System checks eligibility

(Was it delivered? Is it within 7 days? Is category returnable?)

&#x20;       ↓

&#x20;       ├── NOT ELIGIBLE → Agent explains why, offers alternatives

&#x20;       └── ELIGIBLE → Continue

&#x20;               ↓

&#x20;       System asks for reason

&#x20;       (Wrong size / Defective / Not as described / Changed mind)

&#x20;               ↓

&#x20;       Reason requires evidence?

&#x20;       ├── Defective / Not as described → Request photo upload

&#x20;       └── Wrong size / Changed mind → No evidence needed

&#x20;               ↓

&#x20;       Evidence submitted (or waived)

&#x20;               ↓

&#x20;       Auto-approve OR escalate to human?

&#x20;       ├── Wrong size, first return, order < ৳2000 → Auto-approve

&#x20;       └── Defective claim, high value, or repeat returns → Human review

&#x20;               ↓

&#x20;       If human review → ticket created, customer notified

&#x20;       "Your return is under review. We'll respond in 24 hours."

&#x20;               ↓

&#x20;       Human approves or denies in admin portal

&#x20;               ↓

&#x20;       Customer notified of decision

```



\---



\## The Agent State Machine



Every commerce action the agent handles is not a function call. It is a workflow with states.



Each workflow has:

\- A current state

\- Rules that determine what state comes next

\- Conditions that trigger human escalation

\- A timeout behavior if nothing happens



```

STATES for a return:



REQUESTED       → customer asked, nothing verified yet

ELIGIBILITY\_CHECK → system running rules in company policy book

INELIGIBLE      → terminal, agent explains

AWAITING\_REASON → agent asked customer why

AWAITING\_EVIDENCE → agent asked for photo

UNDER\_REVIEW    → sent to human, waiting

APPROVED        → human or auto approved

REJECTED        → human denied with reason

REFUND\_INITIATED → payment team notified

COMPLETED       → done

```



The agent always knows which state a ticket is in and responds accordingly. If a customer messages again about an open return, the agent looks up the current state and continues from there — not from scratch.



\---



\## Human In The Loop — When and How



Not every action needs a human. The system decides based on rules.

\*\*order cancellation:\*\*

* check order cancellation policy from book
* example : if 2 days after order , then tell him unable(check company policy book)



\*\*Auto-approve — no human needed:\*\*

\-check return policy 

\- First return by this customer

\- Order under ৳1500

\- Reason is wrong size or change of mind

\- Item delivered within last 7 days



\*\*Escalate to human — requires review:\*\*

\- Customer claims item is defective or damaged

\- Order value over ৳3000

\- Customer has made 3+ returns this month

\- Dispute involves payment or non-delivery

\- Customer specifically asks to speak to a human

\- Agent confidence in understanding the issue is low



\*\*Human review happens in the admin portal:\*\*

A separate section shows all open tickets requiring human action. Each ticket shows the full conversation history, the customer's evidence photo if submitted, the order details, and two buttons: Approve or Deny with a reason field.



When the human acts, the system automatically notifies the customer and continues the workflow.



\---



\## Dispute Resolution Is Different From Returns



A dispute means the customer believes something went wrong that was not their fault. Higher stakes. More verification needed.



```

DISPUTE TYPES AND FLOWS:



"I never received my order"

→ System checks: was it marked delivered?

→ Yes, delivered → request customer to check with neighbors, 

&#x20;                  check delivery photo if available

&#x20;                  If still not found → escalate to human, 

&#x20;                  create carrier investigation ticket

→ No, not delivered → check if it is late or lost

&#x20;                     Offer: wait 3 more days OR escalate



"I received the wrong item"

→ Request photo of received item

→ Gemini vision analyzes photo → confirms if item matches order

→ Mismatch confirmed → auto-approve replacement or refund

→ Cannot confirm → escalate to human



"I was charged twice"

→ This never auto-resolves

→ Immediately escalated to human

→ Agent says: "We're taking this seriously. A team member will 

&#x20;  review and respond within 2 hours."



"The item looks different from the photo"

→ Interesting case for StyleSense specifically

→ Gemini compares customer's photo of received item 

&#x20;  against product's visual\_description in database

→ If significant mismatch confirmed by AI → auto-approve return

→ If no clear mismatch → escalate with both images for human review

```



\---



\## What the Database Needs for This



The simple `orders` table we have is not enough. You need:



\*\*tickets table\*\*

```

id, order\_id, customer\_id, type (return/dispute/cancellation),

reason, status (current state in workflow), 

evidence\_url (uploaded photo), 

assigned\_to (null = unassigned, uuid = specific human agent),

resolution, resolution\_notes,

created\_at, updated\_at, resolved\_at

```



\*\*ticket\_events table\*\*

```

id, ticket\_id, actor (customer/system/human\_agent),

event\_type (message/state\_change/evidence\_submitted/decision),

content, created\_at

```



Every state transition is an event. The full history is preserved. The agent reads this history when a customer follows up. The human reviewer reads it before making a decision.



\---



\## How the Agent Handles Uncertainty



A real agentic system knows when it does not know what to do.



```python

\# Agent internal reasoning:



confidence = assess\_intent(customer\_message)



if confidence > 0.85:

&#x20;   # Clear intent, handle automatically

&#x20;   execute\_workflow(intent, customer\_message)



elif confidence > 0.60:

&#x20;   # Probably right but not sure

&#x20;   agent\_asks\_clarifying\_question()

&#x20;   # "Just to confirm — you'd like to return the Navy 

&#x20;   #  Jeans from your order on May 15th, is that right?"



else:

&#x20;   # Does not understand

&#x20;   escalate\_to\_human()

&#x20;   # "I want to make sure I help you correctly. 

&#x20;   #  Let me connect you with our team."

```



The agent never pretends to have handled something it has not handled. If it escalates, it tells the customer clearly and gives them a ticket ID so they can follow up.



\---



\## The Updated AI Job List



```

AI Job 1 — Product ingestion        Gemini vision → visual\_description

AI Job 2 — Product search           Gemini + -embedding + pgvector  

AI Job 3 — Shopping assistant       Gemini agent with search/product tools

AI Job 4 — Commerce operations      Gemini agent with workflow state machine

&#x20;                                   └── returns

&#x20;                                   └── cancellations  

&#x20;                                   └── disputes

&#x20;                                   └── order status

AI Job 5 — Mismatch detection       Gemini compares admin text vs image

AI Job 6 — Human review queue       Admin portal shows escalated tickets

&#x20;          (not AI, but AI triggers it)

```





Commerce operations (returns, disputes, cancellations) are not single function calls. Each is a stateful workflow. The agent maintains ticket state in the database. Every action is logged as a ticket event. Rules determine whether the system auto-resolves or escalates to a human. The admin portal has a ticket review queue where humans approve or deny escalated cases. The agent never invents a resolution — it either follows a rule or waits for a human.



