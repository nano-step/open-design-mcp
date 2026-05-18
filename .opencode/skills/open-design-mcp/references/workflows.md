# End-to-End Workflows

Three fully-worked examples. Use these as templates when responding to user requests.

## Workflow A — Explore Existing Projects (Read-Only)

**User intent:** "Show me what designs I already have." / "What's in my OD?"

**Env required:** `OD_DAEMON_URL` only.

```
Step 1: Call od_list_projects with no args.
  Response shape:
  {
    projects: [
      { id: "proj-abc123", name: "Pricing Page", kind: "prototype", status: "ready" },
      { id: "proj-def456", name: "Marketing Site", kind: "site", status: "draft" }
    ]
  }

Step 2: If the user picks one (or you pick the obvious match), call:
  od_get_project { projectId: "proj-abc123" }

  Response shape:
  {
    project: { id, name, kind, fidelity, customInstructions, ... },
    artifacts: [
      { slug: "pricing-v1", path: "...", url: "...", updatedAt: "..." },
      { slug: "pricing-v2", path: "...", url: "...", updatedAt: "..." }
    ]
  }

Step 3: If user wants the HTML, fetch the artifact via its url.
```

**Common pitfalls:**
- If `od_list_projects` returns `[]` and the user expected projects to exist, they're probably pointed at the wrong daemon. Verify `OD_DAEMON_URL`.
- Project IDs are opaque strings, not numeric. Don't try to parse or sort them.

## Workflow B — Generate a New Design from a PRD

**User intent:** "Make me a landing page for a SaaS pricing tool with three tiers."

**Env required:** `OD_DAEMON_URL` + `BYOK_BASE_URL` + `BYOK_API_KEY` + `BYOK_MODEL`.

```
Step 1: Create the project (or reuse an existing one):
  od_create_project {
    name: "Pricing page",
    kind: "prototype",            # use "site" for multi-page, "deck" for slides
    fidelity: "mid",              # "low" = wireframe; "mid" = styled; "high" = production-fidelity
    customInstructions: "Use Tailwind v4, prefer rounded-2xl, dark mode optional"
  }
  → { project: { id: "proj-new123", conversationId: "conv-..." } }

Step 2: Generate. This streams for 10–60 seconds:
  od_generate_design {
    projectId: "proj-new123",
    prompt: "A SaaS pricing page with three tiers: Free ($0), Pro ($29/mo), Enterprise (contact sales). Include a 4-row feature comparison table, an FAQ section with 5 common questions, and a sticky CTA bar at the top.",
    kind: "prototype"
  }
  → { html: "<!doctype html><html>...</html>", agentMessage: "..." }

Step 3: Lint BEFORE saving (cheap, prevents broken artifacts):
  od_lint_artifact { html: "<!doctype html>..." }
  → { findings: [...], agentMessage: "..." }
  If any finding has severity "error", regenerate with a refinement prompt.

Step 4: Save:
  od_save_artifact {
    projectId: "proj-new123",
    slug: "pricing-v1",            # kebab-case, URL-safe
    html: "<!doctype html>..."
  }
  → { saved: true, path: "...", url: "..." }

Step 5: Report to the user:
  - project ID + name
  - artifact slug + URL
  - any lint findings worth mentioning (e.g. "minor: missing alt text on hero image")
```

**Common pitfalls:**
- Passing markdown fences (\`\`\`html ... \`\`\`) as the prompt body — the LLM will think those are part of the design and embed them in output. Strip fences from PRD before passing.
- Forgetting `kind` — it defaults but defaults may not match the project's `kind`, producing mismatched output. Explicitly pass to be safe.
- Calling `od_save_artifact` before lint and shipping broken HTML to the user.

## Workflow C — Iterate on a Broken or Outdated Artifact

**User intent:** "Fix the nav on my pricing page — it should be sticky."

**Env required:** `OD_DAEMON_URL` + BYOK (same as Workflow B).

```
Step 1: Find the project + existing artifact:
  od_list_projects                           # if user didn't give an ID
  od_get_project { projectId: "proj-abc123" }
  → { project, artifacts: [{ slug: "pricing-v1", url: "..." }] }

Step 2: (Optional) Fetch the current HTML from the artifact URL to confirm the issue.

Step 3: Regenerate with a refinement prompt:
  od_generate_design {
    projectId: "proj-abc123",
    prompt: "Keep everything from the previous version. Change only: make the nav sticky at top, add a subtle shadow on scroll. Use position: sticky, top: 0, z-index: 50.",
    kind: "prototype"
  }
  → { html: "<!doctype html>..." }

Step 4: Lint:
  od_lint_artifact { html }

Step 5: Save with the SAME slug to overwrite, or a new slug for versioning:
  od_save_artifact {
    projectId: "proj-abc123",
    slug: "pricing-v1",       # overwrites
    # or: slug: "pricing-v2",  # versioned
    html
  }
```

**Important:** `od_generate_design` is single-turn. It doesn't have memory of previous designs in this project. The new generation is fully fresh — the prompt must include enough context to reproduce the parts you want to keep. Long-running design preferences belong in `customInstructions` on the project (set via `od_update_project`), not in the per-generation prompt.

**Slug strategy:**
- For drafts where the user is still iterating: overwrite the same slug (`pricing-v1`).
- For checkpoints worth keeping: use versioned slugs (`pricing-v1`, `pricing-v2`).
- For A/B variants: descriptive slugs (`pricing-dark`, `pricing-light`).

## Cross-Cutting Tips

- **One project, many artifacts.** A project is a logical grouping (e.g., "Pricing Page"); artifacts are slugged HTML files inside it (e.g., `pricing-v1`, `pricing-faq`).
- **`customInstructions` is durable, prompt is per-call.** Use `customInstructions` for design tokens, brand colors, font stack. Use `prompt` for what to build *this time*.
- **Read errors before retrying.** A 401 won't fix itself by re-running. See [errors.md](errors.md).
- **Streaming is synchronous from the LLM's view.** Once `od_generate_design` is called, wait for the result. Don't issue parallel tool calls — they'll race the stream.
