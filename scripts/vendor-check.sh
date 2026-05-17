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

echo "vendor-check: ok"
