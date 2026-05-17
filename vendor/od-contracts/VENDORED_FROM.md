# Vendored from open-design

## Source

```
Upstream Repository: https://github.com/nexu-io/open-design
Upstream License: Apache-2.0
Upstream Commit SHA: 7766582f0bd75d2dce31b2f9db01a482af801897
Upstream Commit Date: 2026-05-17T12:28:18+09:00
Upstream Commit Message: chore(ci): scope nix-check workflow permissions to contents:read (#1870)
Upstream Path: packages/contracts/src/
Vendored on: 2026-05-17T12:19:18Z
```

## Files Vendored

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

- `src/index.ts` — poisonous barrel (see design.md § D6).

## Modifications

- `src/api/chat.ts` — Added `.js` extensions on relative imports for Node16 moduleResolution (see in-file MODIFICATION header).

## Re-sync Procedure

```bash
bash scripts/vendor-sync.sh <upstream-sha>
```

## License

Apache License 2.0. See `LICENSE` and `NOTICE` in this directory.
