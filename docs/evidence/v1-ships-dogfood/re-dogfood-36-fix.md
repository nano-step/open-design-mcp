# Re-dogfood: #36 fix proof (silent-truncation closed)

**Date**: 2026-05-19
**Daemon**: `https://od.thnkandgrow.com/`
**MCP version under test**: `open-design-mcp@0.14.8` (post-PR #51 merge)
**Project**: `v1-dogfood-2026-05-19`
**Brief**: same `lithe` landing-page composed brief as the original dogfood

## Methodology

1. Spawn `npx -y open-design-mcp@0.14.8` against the hosted daemon with full BYOK creds
2. Invoke `tools/call od_generate_design` with the EXACT same composed brief from the original dogfood (`docs/evidence/v1-ships-dogfood/composed-brief.txt`, 2,114 chars)
3. Don't pass `maxTokens` — let the new default of 64000 apply
4. Measure: response length, duration, presence of `</body>` and `</html>` closers

## Comparison

| Metric | Original dogfood (v0.14.2) | This run (v0.14.8) |
|---|---|---|
| `maxTokens` to daemon | unset → daemon default 8192 | unset → MCP default 64000 |
| Response length | 21,484 bytes | **31,357 bytes** |
| `</body>` present | ❌ NO | ✅ YES |
| `</html>` present | ❌ NO | ✅ YES |
| Output completeness | hero only, cut mid-stylesheet | nav + hero + features + pricing + FAQ + footer + inline JS |
| Wall time | ~85s (cap-truncated) | 141.9s (natural completion) |
| MCP `isError` | undefined (silent) | false (clean exit) |

Tail of the new response (last 300 chars):
```
ied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('copied');
    }, 2000);
  }).catch(() => {
    btn.textContent = 'failed';
    setTimeout(() => { btn.textContent = 'copy'; }, 2000);
  });
}
</script>

</body>
</html>
</artifact>
```

Clean close. Page rendered every requested section.

## Verdict: silent-truncation FIXED

The default `maxTokens: 64000` forwarded to the daemon's `ProxyStreamRequest` body lifts the cap from 8192 → 64000. A full multi-section landing page now completes naturally without truncation. The MCP exits cleanly (`isError: false`) because the SSE stream really did end naturally — not mid-output.

## Implication for the `od-workflow` skill

The skill's multi-section workflow (hero + features + pricing + FAQ) was previously aspirational — the daemon truncated before completing. With this fix, the skill's Turn 3+ generations actually produce the complete pages it teaches subagents to build.

## Closing #36

This evidence closes [#36](https://github.com/nano-step/open-design-mcp/issues/36) (and confirms [#44](https://github.com/nano-step/open-design-mcp/issues/44), closed earlier as duplicate, is also fixed).
