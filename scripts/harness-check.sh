#!/usr/bin/env bash
# harness-check — verify a change's story file ticks every Harness Compliance
# Checklist box. Reads docs/stories/<slug>.md, counts unchecked items, prints
# them, exits non-zero if any remain (unless the story is in pre-merge phases).
#
# Usage:
#   scripts/harness-check.sh <story-slug>          # check one story
#   scripts/harness-check.sh --all                 # check every story
#   scripts/harness-check.sh --list                # list known story slugs
#   scripts/harness-check.sh <slug> --strict       # exit 1 on ANY unchecked box
#   scripts/harness-check.sh <slug> --pre-merge    # exit 1 only if a merge-blocking box is unchecked
#
# Exit codes:
#   0  all required checks passed (or story marked planned/in-progress in non-strict mode)
#   1  unchecked items found in a phase that should be done
#   2  story file not found / usage error
#
# The checklist is the source of truth — see docs/templates/story.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STORIES_DIR="${REPO_ROOT}/docs/stories"

bold() { printf '\033[1m%s\033[0m' "$1"; }
red()  { printf '\033[31m%s\033[0m' "$1"; }
grn()  { printf '\033[32m%s\033[0m' "$1"; }
ylw()  { printf '\033[33m%s\033[0m' "$1"; }

usage() {
  sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

list_stories() {
  if [[ ! -d "${STORIES_DIR}" ]]; then
    echo "harness-check: no docs/stories/ directory" >&2
    exit 2
  fi
  find "${STORIES_DIR}" -maxdepth 1 -type f -name '*.md' \
    | xargs -n1 basename \
    | sed 's/\.md$//' \
    | sort
}

# Phases that block merge (the merge gate must see these green).
MERGE_BLOCKING=(
  issue propose specs story branch implement validate
  review-gate pr-opened pr-bot
)

# Phases that need to be done by archive time (post-merge).
ARCHIVE_BLOCKING=(merged archived test-matrix issue-closed)

# Extract checklist state from a story file. Emits TSV: status<TAB>phase<TAB>label
parse_checklist() {
  local file="$1"
  # POSIX-safe: extract the section between '## Harness Compliance Checklist'
  # and the next '## ' heading, then parse each '- [x] **phase**: label' line.
  sed -n '/^## Harness Compliance Checklist/,/^## /p' "${file}" \
    | grep -E '^- \[[ xX]\] \*\*[a-z0-9-]+\*\*:' \
    | while IFS= read -r line; do
        local mark phase label status
        mark="${line:3:1}"
        local rest="${line#- \[*\] \*\*}"
        phase="${rest%%\*\**}"
        label="${rest#*\*\*: }"
        if [[ "${mark}" == "x" || "${mark}" == "X" ]]; then
          status=done
        else
          status=todo
        fi
        printf '%s\t%s\t%s\n' "${status}" "${phase}" "${label}"
      done
}

# Check a single story file. Returns 0 if all relevant phases done, 1 otherwise.
check_story() {
  local slug="$1"
  local mode="${2:-default}"  # default | strict | pre-merge
  local file="${STORIES_DIR}/${slug}.md"

  if [[ ! -f "${file}" ]]; then
    red "✗ "; echo "story not found: ${file}"
    return 2
  fi

  local todos=()
  local dones=()
  local TAB=$'\t'
  while IFS=$'\t' read -r status phase label; do
    [[ -z "${phase:-}" ]] && continue
    if [[ "${status}" == "done" ]]; then
      dones+=("${phase}")
    else
      todos+=("${phase}${TAB}${label}")
    fi
  done < <(parse_checklist "${file}")

  local total=$(( ${#todos[@]} + ${#dones[@]} ))
  if [[ "${total}" -eq 0 ]]; then
    ylw "⚠ "; echo "${slug}: no '## Harness Compliance Checklist' section found"
    return 1
  fi

  # Determine which unchecked items matter given the mode.
  local blocking=()
  if [[ "${mode}" == "strict" ]]; then
    blocking=("${todos[@]}")
  elif [[ "${mode}" == "pre-merge" ]]; then
    for entry in "${todos[@]:-}"; do
      [[ -z "${entry:-}" ]] && continue
      local phase="${entry%%$'\t'*}"
      for mb in "${MERGE_BLOCKING[@]}"; do
        if [[ "${phase}" == "${mb}" ]]; then
          blocking+=("${entry}")
          break
        fi
      done
    done
  else
    # default mode: any unchecked item that's not a post-merge phase
    for entry in "${todos[@]:-}"; do
      [[ -z "${entry:-}" ]] && continue
      blocking+=("${entry}")
    done
  fi

  local pct
  if [[ "${total}" -eq 0 ]]; then pct=0; else pct=$(( ${#dones[@]} * 100 / total )); fi

  echo
  bold "── ${slug} "; echo "── ${#dones[@]}/${total} ticked (${pct}%) ──"
  if [[ "${#blocking[@]}" -eq 0 ]]; then
    grn "✓ "; echo "all relevant boxes ticked (mode: ${mode})"
    return 0
  fi

  red "✗ "; echo "${#blocking[@]} unchecked phase(s):"
  for entry in "${blocking[@]:-}"; do
    [[ -z "${entry:-}" ]] && continue
    local phase="${entry%%$'\t'*}"
    local label="${entry#*$'\t'}"
    printf '    %s %s — %s\n' "$(red '✗')" "${phase}" "${label}"
  done
  return 1
}

main() {
  [[ $# -eq 0 ]] && usage

  local mode="default"
  local args=()
  for a in "$@"; do
    case "${a}" in
      --strict)    mode="strict" ;;
      --pre-merge) mode="pre-merge" ;;
      --list)      list_stories; exit 0 ;;
      --all)       args+=("__ALL__") ;;
      --help|-h)   usage ;;
      -*)          echo "harness-check: unknown flag: ${a}" >&2; exit 2 ;;
      *)           args+=("${a}") ;;
    esac
  done

  [[ "${#args[@]}" -eq 0 ]] && usage

  local exit_code=0
  if [[ "${args[0]}" == "__ALL__" ]]; then
    while IFS= read -r slug; do
      check_story "${slug}" "${mode}" || exit_code=$?
    done < <(list_stories)
  else
    for slug in "${args[@]}"; do
      check_story "${slug}" "${mode}" || exit_code=$?
    done
  fi

  echo
  if [[ "${exit_code}" -eq 0 ]]; then
    grn "harness-check: PASS"; echo
  else
    red "harness-check: FAIL"; echo " (exit ${exit_code})"
  fi
  exit "${exit_code}"
}

main "$@"
