# Current od_get_project output schema

From `src/tools/get-project.ts:16-25`:

```ts
outputSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    kind: z.string().optional(),
    status: z.string().optional(),
    resolvedDir: z.string().optional(),
  }),
  files: z.array(fileSummarySchema),
});
```

Missing fields the daemon already returns:
- `metadata.customInstructions` (3,928 chars on the live project)
- `metadata.fidelity`
- `skillId`
- `designSystemId`
- `createdAt`
- `updatedAt`
