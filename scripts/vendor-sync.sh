#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${REPO_ROOT}/vendor/od-contracts"
UPSTREAM_REPO="nexu-io/open-design"
UPSTREAM_URL="https://github.com/${UPSTREAM_REPO}.git"
UPSTREAM_BASE="packages/contracts"
TEMP_CLONE_DIR="${TMPDIR:-/tmp}/od-vendor-sync-$$"

usage() {
  cat <<EOF
Usage: $(basename "$0") <upstream-commit-sha|HEAD|tag>

Sync vendor/od-contracts/src/ from upstream open-design at a pinned commit.

Examples:
  $(basename "$0") 7766582f0bd75d2dce31b2f9db01a482af801897
  $(basename "$0") HEAD

Pre-conditions:
  - No uncommitted changes in vendor/od-contracts/
  - git and rsync installed

The script will:
  1. Refuse to run if vendor has uncommitted changes
  2. Shallow + sparse-clone upstream at the resolved SHA
  3. Copy 13 files (7 runtime + 6 type-only) into vendor/od-contracts/src/
  4. Patch src/api/chat.ts to add .js extensions (Node16 compat — see design.md D6)
  5. Update VENDORED_FROM.md with new SHA, ISO timestamp, commit metadata
  6. Generate a diff report at .vendor-diff-report-<timestamp>.txt
  7. Clean up temp clone
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

UPSTREAM_REF="$1"

cd "${REPO_ROOT}"

if [[ -d "${VENDOR_DIR}/src" ]] && [[ -n "$(find "${VENDOR_DIR}/src" -type f -name '*.ts' 2>/dev/null)" ]]; then
  if ! git diff-index --quiet HEAD -- vendor/od-contracts/ 2>/dev/null; then
    echo "vendor-sync: refusing to run — uncommitted changes in vendor/od-contracts/" >&2
    git status --short vendor/od-contracts/ >&2
    exit 1
  fi
fi

echo "vendor-sync: cloning ${UPSTREAM_REPO} into ${TEMP_CLONE_DIR}..."
git clone --filter=blob:none --sparse "${UPSTREAM_URL}" "${TEMP_CLONE_DIR}" 2>&1 | tail -3
cd "${TEMP_CLONE_DIR}"

git checkout --quiet "${UPSTREAM_REF}"
FULL_SHA="$(git rev-parse HEAD)"
COMMIT_DATE="$(git log -1 --format=%aI HEAD)"
COMMIT_MSG="$(git log -1 --format=%s HEAD)"

echo "vendor-sync: resolved ${UPSTREAM_REF} → ${FULL_SHA}"
echo "vendor-sync:   date: ${COMMIT_DATE}"
echo "vendor-sync:   msg:  ${COMMIT_MSG}"

git sparse-checkout set "${UPSTREAM_BASE}/src" >/dev/null

SRC_BASE="${TEMP_CLONE_DIR}/${UPSTREAM_BASE}/src"
[[ -d "${SRC_BASE}" ]] || {
  echo "vendor-sync: FAIL — upstream path ${UPSTREAM_BASE}/src not found at ${FULL_SHA}" >&2
  cd "${REPO_ROOT}"
  rm -rf "${TEMP_CLONE_DIR}"
  exit 1
}

DEST="${VENDOR_DIR}/src"
BACKUP_DIR="${REPO_ROOT}/.vendor-backup-$(date +%s)"
if [[ -d "${DEST}" ]] && [[ -n "$(find "${DEST}" -type f -name '*.ts' 2>/dev/null)" ]]; then
  echo "vendor-sync: backing up current vendor to ${BACKUP_DIR}..."
  mkdir -p "${BACKUP_DIR}"
  cp -r "${DEST}" "${BACKUP_DIR}/"
fi

mkdir -p "${DEST}/prompts" "${DEST}/api"

FILES_RUNTIME=(
  "prompts/system.ts"
  "prompts/official-system.ts"
  "prompts/discovery.ts"
  "prompts/directions.ts"
  "prompts/deck-framework.ts"
  "prompts/media-contract.ts"
  "api/projects.ts"
)
FILES_TYPE_ONLY=(
  "api/chat.ts"
  "api/files.ts"
  "api/comments.ts"
  "api/research.ts"
  "api/artifacts.ts"
  "common.ts"
)

copy_one() {
  local relpath="$1"
  local src="${SRC_BASE}/${relpath}"
  local dest="${DEST}/${relpath}"
  if [[ ! -f "${src}" ]]; then
    echo "vendor-sync: FAIL — upstream missing ${relpath}" >&2
    exit 1
  fi
  mkdir -p "$(dirname "${dest}")"
  cp "${src}" "${dest}"
  echo "  ✓ ${relpath}"
}

echo "vendor-sync: copying 13 files..."
for f in "${FILES_RUNTIME[@]}"; do copy_one "$f"; done
for f in "${FILES_TYPE_ONLY[@]}"; do copy_one "$f"; done

CHAT_FILE="${DEST}/api/chat.ts"
if [[ -f "${CHAT_FILE}" ]]; then
  echo "vendor-sync: patching extensionless imports in api/chat.ts (Apache 2.0 §4(b) modification)..."
  PATCH_HEADER="// MODIFICATION (open-design-mcp):
// Added explicit \`.js\` extensions on relative imports for Node16
// moduleResolution. The upstream uses \`moduleResolution: \"Bundler\"\`
// which permits extensionless imports; this package uses Node16 which
// forbids them (TS2835). Patent grant + license terms unchanged.
// Modified by: scripts/vendor-sync.sh
// Modification date: $(date -u +%Y-%m-%dT%H:%M:%SZ)
"
  TMP_PATCHED="$(mktemp)"
  printf '%s\n' "${PATCH_HEADER}" > "${TMP_PATCHED}"
  sed -E \
    -e "s|from '\\./files'|from './files.js'|g" \
    -e "s|from '\\./comments'|from './comments.js'|g" \
    -e "s|from '\\./research'|from './research.js'|g" \
    "${CHAT_FILE}" >> "${TMP_PATCHED}"
  mv "${TMP_PATCHED}" "${CHAT_FILE}"
fi

cd "${REPO_ROOT}"

VENDORED_FROM="${VENDOR_DIR}/VENDORED_FROM.md"
cat > "${VENDORED_FROM}" <<EOF
# Vendored from open-design

## Source

\`\`\`
Upstream Repository: https://github.com/${UPSTREAM_REPO}
Upstream License: Apache-2.0
Upstream Commit SHA: ${FULL_SHA}
Upstream Commit Date: ${COMMIT_DATE}
Upstream Commit Message: ${COMMIT_MSG}
Upstream Path: ${UPSTREAM_BASE}/src/
Vendored on: $(date -u +%Y-%m-%dT%H:%M:%SZ)
\`\`\`

## Files Vendored

### Runtime (7 files)

$(printf -- "- src/%s\n" "${FILES_RUNTIME[@]}")

### Type-only (6 files)

$(printf -- "- src/%s\n" "${FILES_TYPE_ONLY[@]}")

### Explicitly excluded

- \`src/index.ts\` — poisonous barrel (see design.md § D6).

## Modifications

- \`src/api/chat.ts\` — Added \`.js\` extensions on relative imports for Node16 moduleResolution (see in-file MODIFICATION header).

## Re-sync Procedure

\`\`\`bash
bash scripts/vendor-sync.sh <upstream-sha>
\`\`\`

## License

Apache License 2.0. See \`LICENSE\` and \`NOTICE\` in this directory.
EOF

DIFF_REPORT="${REPO_ROOT}/.vendor-diff-report-$(date +%s).txt"
if [[ -d "${BACKUP_DIR}/src" ]]; then
  {
    echo "=== vendor-sync diff report ==="
    echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "From: ${UPSTREAM_REPO}@${FULL_SHA}"
    echo ""
    diff -rq "${BACKUP_DIR}/src" "${DEST}" || true
  } > "${DIFF_REPORT}"
  echo "vendor-sync: diff report at ${DIFF_REPORT}"
fi

rm -rf "${TEMP_CLONE_DIR}"

echo ""
echo "vendor-sync: ok"
echo "  files copied: $((${#FILES_RUNTIME[@]} + ${#FILES_TYPE_ONLY[@]}))"
echo "  SHA pinned:   ${FULL_SHA}"
echo ""
echo "Next steps:"
echo "  git diff vendor/od-contracts/"
echo "  npm run typecheck"
echo "  npm test"
echo "  bash scripts/vendor-check.sh"
