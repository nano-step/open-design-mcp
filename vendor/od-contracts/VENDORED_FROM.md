# Vendored from open-design

## Source

```
Upstream Repository: https://github.com/nexu-io/open-design
Upstream License: Apache-2.0
Upstream Commit SHA: 7766582f0bd75d2dce31b2f9db01a482af801897
Upstream Commit Date: 2026-05-17T12:28:18+09:00
Upstream Commit Message: chore(ci): scope nix-check workflow permissions to contents:read (#1870)
Upstream Path: packages/contracts/src/
Vendored on: 2026-05-17T08:06:00Z
```

## Files Vendored

The transitive closure of `composeSystemPrompt()` from upstream `packages/contracts/src/prompts/system.ts`.

### Runtime (7 files)

- src/prompts/system.ts
- src/prompts/official-system.ts
- src/prompts/discovery.ts
- src/prompts/directions.ts
- src/prompts/deck-framework.ts
- src/prompts/media-contract.ts
- src/api/projects.ts

### Type-only (6 files)

- src/api/chat.ts
- src/api/files.ts
- src/api/comments.ts
- src/api/research.ts
- src/api/artifacts.ts
- src/common.ts

### Explicitly excluded

- `src/index.ts` — poisonous barrel re-exports 30+ modules we do not vendor (`errors`, `tasks`, `examples`, `sse/*`, `analytics/*`, `plugins/*`, `critique`). See `openspec/changes/init-package-scaffold/design.md` § D6 for rationale.

**Total:** 13 files (~155 KB, ~2,500 lines). No external npm runtime dependencies.

## Modifications

(none — populated by `scripts/vendor-sync.sh` during the `vendor-sync-initial` change)

When the `vendor-sync-initial` change copies the actual source, `scripts/vendor-sync.sh` will:

1. Patch `src/api/chat.ts` lines 1, 7-8 to add `.js` extensions on relative imports (`./files` → `./files.js`, `./comments` → `./comments.js`, `./research` → `./research.js`). Reason: upstream uses `moduleResolution: "Bundler"` but this package uses `Node16`, which forbids extensionless relative imports (TS2835).
2. Add the Apache 2.0 §4(b) "MODIFICATION" header to `chat.ts` per the template in `openspec/changes/init-package-scaffold/design.md` § D14.
3. Append an entry to this section recording the modification.

## Re-sync Procedure

```bash
# Pin a new upstream commit:
bash scripts/vendor-sync.sh <upstream-sha>

# Or sync to latest master HEAD (resolves to a concrete SHA):
bash scripts/vendor-sync.sh HEAD
```

The script:

- Refuses to run if `vendor/od-contracts/` has uncommitted changes
- Resolves the input argument to a 40-character SHA before updating this file
- Shallow + sparse clones upstream (only `packages/contracts/src/{prompts,api,common.ts}`)
- Patches `chat.ts` extensionless imports
- Updates this file with new SHA + ISO timestamp + modifications entry
- Emits a diff report so the reviewer can see exactly what upstream changed

See `openspec/changes/init-package-scaffold/design.md` § D6 (vendor layout) and § D8 (sync script) for details.

## License

This vendored subtree is licensed under Apache License 2.0. See `LICENSE` in this directory for the full license text. See `NOTICE` for attribution.

Per Apache 2.0 §4(a)-(d):
- A copy of the LICENSE is preserved in this directory (§4(a))
- Modifications to vendored files carry a `MODIFICATION` header (§4(b))
- Original upstream copyright headers are retained in each vendored file (§4(c))
- This NOTICE references the upstream attribution (§4(d))
