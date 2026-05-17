#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${REPO_ROOT}/vendor/od-contracts"

fail() {
  echo "vendor-check: FAIL — $1" >&2
  exit 1
}

[[ -s "${VENDOR_DIR}/LICENSE" ]] || fail "vendor/od-contracts/LICENSE missing or empty"
[[ -s "${VENDOR_DIR}/NOTICE" ]] || fail "vendor/od-contracts/NOTICE missing or empty"
[[ -s "${VENDOR_DIR}/VENDORED_FROM.md" ]] || fail "vendor/od-contracts/VENDORED_FROM.md missing or empty"

grep -qE '^Upstream Commit SHA: [a-f0-9]{40}$' "${VENDOR_DIR}/VENDORED_FROM.md" \
  || fail "VENDORED_FROM.md missing 40-char SHA line (expected 'Upstream Commit SHA: <40 hex>')"

[[ -s "${REPO_ROOT}/LICENSE" ]] || fail "top-level LICENSE missing or empty"
[[ -s "${REPO_ROOT}/NOTICE" ]] || fail "top-level NOTICE missing or empty"

# Post-sync invariants (Metis TG-1/TG-2/TG-4 — bg_2aaef543).
# Backward-compatible: each block keys on existence of vendored sources so the script
# passes against both the scaffold state (0 .ts files) and the post-sync state (13 .ts files).

VENDOR_SRC="${VENDOR_DIR}/src"
expected_count=13
actual_count=$(find "${VENDOR_SRC}" -name '*.ts' -type f 2>/dev/null | wc -l | tr -d ' ')
if [[ "${actual_count}" != "0" && "${actual_count}" != "${expected_count}" ]]; then
  fail "expected 0 (pre-sync) or ${expected_count} (post-sync) .ts files under vendor/od-contracts/src/, found ${actual_count}"
fi

CHAT_TS="${VENDOR_SRC}/api/chat.ts"
if [[ -f "${CHAT_TS}" ]]; then
  grep -q "from '\./files\.js'" "${CHAT_TS}" \
    || fail "chat.ts missing .js suffix on relative imports — vendor-sync.sh sed patch did not apply"
  head -25 "${CHAT_TS}" | grep -q 'MODIFICATION (open-design-mcp)' \
    || fail "chat.ts missing Apache 2.0 §4(b) MODIFICATION header in first 25 lines"
  grep -q '^- `src/api/chat\.ts`' "${VENDOR_DIR}/VENDORED_FROM.md" \
    || fail "VENDORED_FROM.md Modifications section missing src/api/chat.ts entry"
fi

echo "vendor-check: ok"
