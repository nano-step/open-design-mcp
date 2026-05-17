# Validation Evidence: init-package-scaffold

Generated: 2026-05-17T08:16:40Z
Commit (HEAD): 5d2a96b8f07ac4c3f7ebc69b8fa8899197c25503
Node version: v22.22.3
npm version: 10.9.8

## Validation Ladder Results


### 1. npm run lint

Command: `npm run lint`

```

> open-design-mcp@0.1.0 lint
> eslint src --max-warnings 0

[exit code: 0]
```

### 2. npm run typecheck

Command: `npm run typecheck`

```

> open-design-mcp@0.1.0 typecheck
> tsc --noEmit

[exit code: 0]
```

### 3. npm test

Command: `npm test`

```

> open-design-mcp@0.1.0 test
> vitest run


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90m/Users/tamlh/workspaces/self/AI/Tools/open-design-mcp[39m

 [32m✓[39m src/__tests__/server.test.ts [2m([22m[2m7 tests[22m[2m)[22m[90m 13[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m7 passed[39m[22m[90m (7)[39m
[2m   Start at [22m 08:16:45
[2m   Duration [22m 392ms[2m (transform 40ms, setup 0ms, collect 33ms, tests 13ms, environment 0ms, prepare 134ms)[22m

[exit code: 0]
```

### 4. npm run build

Command: `npm run build`

```

> open-design-mcp@0.1.0 build
> tsc && shx chmod +x dist/src/server.js

[exit code: 0]
```

### 5. bash scripts/vendor-check.sh

Command: `bash scripts/vendor-check.sh`

```
vendor-check: ok

[exit code: 0]
```

### 6. npm run test:integration

Command: `npm run test:integration`

```

> open-design-mcp@0.1.0 test:integration
> vitest run --config vitest.integration.config.ts


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90m/Users/tamlh/workspaces/self/AI/Tools/open-design-mcp[39m

[open-design-mcp] starting on stdio
[open-design-mcp] ready
 [32m✓[39m tests/integration/initialize-handshake.test.ts [2m([22m[2m3 tests[22m[2m)[22m[90m 296[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m3 passed[39m[22m[90m (3)[39m
[2m   Start at [22m 08:16:47
[2m   Duration [22m 952ms[2m (transform 32ms, setup 0ms, collect 287ms, tests 296ms, environment 0ms, prepare 123ms)[22m

[exit code: 0]
```
