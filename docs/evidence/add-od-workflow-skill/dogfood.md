# Dogfood Evidence — add-od-workflow-skill

## Methodology

Two `explore` subagents fired in parallel against the same realistic prompt:

> "Make me a complete SaaS pricing page for a developer-tools product. 3 tiers (Free, Pro $29/mo, Enterprise contact-sales). Include a feature comparison table and a 6-question FAQ. Backend developer audience, no fake stats."

| Run | Skills loaded |
|---|---|
| **A — with both** | `open-design-mcp` (tool reference) + `od-workflow` (NEW choreography) |
| **B — baseline** | `open-design-mcp` only |

Each was asked to produce a structured "turn-1 response + full flow plan + tools per turn + failure-mode guards". No actual tool calls were made — the plan quality is the signal.

## Verdict

**8/8 dimensions: with-skill demonstrably better.** The new skill works as designed.

| # | Aspect | With od-workflow | Without (baseline) |
|---|---|---|---|
| 1 | Turn-1 behavior | Emits discovery questions (RULE 1), then STOPS | Proposes a phased plan, asks "does this flow work?" — doesn't ask design questions |
| 2 | Discovery rigor | 6 specific questions covering product positioning, audience persona, brand context, FAQ content; drops 3 questions already answered in the brief | No design discovery; asks process confirmation only |
| 3 | Brand handling | "If brand URL → WebFetch extract; else → pick from 5-direction library" | Mentions `customInstructions` only as afterthought on Turn 3 |
| 4 | TodoWrite plan | Explicitly names the 8-step plan with live `in_progress` / `completed` updates as core mechanism | Generic "phased approach" — no TodoWrite mentioned |
| 5 | 5-dimensional critique | "Run P0 anti-AI-slop checklist + 5-dim critique" | Not mentioned at all |
| 6 | Anti-slop guardrails | Explicit: "no purple gradients, no emoji icons, no invented metrics, no Inter as display, no warm beige washes" | Mentions "no fake stats" because user said so; no broader slop awareness |
| 7 | Brand-consistency story | Uses `projectId` auto-fetch + `customInstructions` so multi-section generations share design language | Doesn't address consistency |
| 8 | Multi-section build | Splits into hero + pricing-table + FAQ subgenerations under one `projectId` | Single big `od_generate_design` call |

## Raw outputs (truncated to key sections)

### Run A — WITH both skills (bg_9954d5ce, 26s)

> **TURN-1 RESPONSE TO USER:**
>
> Let me make sure I understand what you're building before I dive in.
>
> To create a pricing page that *resonates* with backend developers (not generic SaaS copy), I need to ask a few clarifying questions:
>
> **About your product & positioning:**
> 1. What does your developer-tools product *do*? (e.g., API gateway, database optimization, testing framework, deployment tooling)
> 2. Who is the *primary persona* buying this? (e.g., DevOps engineers, backend architects, engineering managers choosing tooling)
> 3. What's the main job-to-be-done for the Free tier?
>
> **About design direction:**
> 4. Do you have brand colors, typography, or a brand URL I should reference for consistency?
> 5. If not, would you prefer a direction? I have 5 ready: minimal-technical (Vercel-style), enterprise-bold, startup-vibrant, design-forward, or developer-centric dark theme.
>
> **About the FAQ:**
> 6. Which 6 questions matter most to your buyers?
>
> **One note:** I won't use invented metrics ("10× faster", "99.9% uptime") — if you don't have real numbers, I'll flag those spots and we'll use honest placeholders. Backend devs smell BS.

(Then stops. Cites RULE 1. Plans Turn 2 brand branching. Plans Turn 3 TodoWrite + 5-dim critique + lint + save.)

### Run B — WITHOUT od-workflow (bg_dfe938e4, 31s)

> **TURN-1 RESPONSE TO USER:**
>
> Perfect — I'll build a SaaS pricing page using open-design-mcp's generation pipeline. Here's the plan:
>
> **Phase 1 (Turn 1 — now): Project setup + prompt refinement**
> **Phase 2 (Turn 2): Generate design**
> **Phase 3 (Turn 3): Validate & refine**
>
> Let me start by creating the project and showing you the PRD I'll send to the generator. Does this flow work for you?

(No design questions asked. Plans single big `od_generate_design` call. No 5-dim critique. No TodoWrite mentioned. No anti-slop checklist beyond user's "no fake stats" comment.)

## Conclusion

The new `od-workflow` skill produces the multi-turn OD-style behavior we wanted:

- ✅ Turn 1 = discovery first, stop (not "let me start generating")
- ✅ Turn 2 = branch on brand answer (Branch A extraction or Branch B direction pick)
- ✅ Turn 3+ = TodoWrite plan, live updates, P0 checklist, 5-dim critique, then emit

Without the skill, the subagent's plan was structurally reasonable but did NOT engage the discovery/critique loops that separate "AI shipped something" from "design is right" (the explicit value-prop from the upstream OD prompt).

Ship.
