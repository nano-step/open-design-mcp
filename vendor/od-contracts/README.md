# vendor/od-contracts

This directory holds a vendored subset of [`nexu-io/open-design`](https://github.com/nexu-io/open-design) (Apache 2.0). Specifically: the prompt-composition pipeline (`composeSystemPrompt()`) and its transitive type dependencies, so `open-design-mcp` can build the same system prompt the Open Design web UI uses for its BYOK chat turns — without depending on the private `@open-design/contracts` package.

## What's here

| File | Purpose |
|---|---|
| `LICENSE` | Apache License 2.0 (copied from upstream at the pinned commit) |
| `NOTICE` | Attribution to nexu-io/open-design per §4(d) |
| `VENDORED_FROM.md` | Pinned upstream commit SHA, file list, modifications log, re-sync instructions |
| `README.md` | This file |
| `src/` | Vendored TypeScript sources (empty in the scaffold PR; populated by the `vendor-sync-initial` change via `scripts/vendor-sync.sh`) |

## Re-syncing

```bash
# Sync to a specific commit
bash scripts/vendor-sync.sh 7766582f0bd75d2dce31b2f9db01a482af801897

# Sync to latest upstream master (resolved to a concrete SHA)
bash scripts/vendor-sync.sh HEAD
```

The sync script enforces these invariants:

- No uncommitted changes in `vendor/od-contracts/` before running (refuses otherwise).
- Resolves tag / `HEAD` arguments to a 40-char SHA before writing `VENDORED_FROM.md`.
- Patches `src/api/chat.ts` to add `.js` extensions on relative imports (required for our `moduleResolution: "Node16"` — upstream uses `Bundler`).
- Atomically updates `VENDORED_FROM.md` with the new SHA, ISO timestamp, and modifications entry.
- Emits a diff report at `.vendor-diff-report-<timestamp>.txt` for reviewer inspection.

After `vendor-sync.sh` completes, verify the result:

```bash
bash scripts/vendor-check.sh   # invariant check
npm run typecheck              # vendored sources compile cleanly
npm test                       # unit tests pass
```

## License

Apache License 2.0. See `LICENSE` for the full text. See `NOTICE` for attribution. See `VENDORED_FROM.md` for the upstream commit pin and any modifications made post-sync.
