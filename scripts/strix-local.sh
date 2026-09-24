#!/usr/bin/env bash
# Run the same Strix pentest locally that CI runs on pull requests.
#
# Prerequisites:
#   - Docker running (Strix executes all exploit validation inside its sandbox)
#   - STRIX_LLM and LLM_API_KEY exported (or already saved in
#     ~/.strix/cli-config.json by a previous interactive run)
#
# Usage:
#   bash scripts/strix-local.sh            # quick diff-style review
#   bash scripts/strix-local.sh deep       # full-depth sweep
#
# Exit codes mirror Strix headless mode: 0 clean, 1 fatal error,
# 2 vulnerabilities found (see strix_runs/<run-name>/ for the report).

set -uo pipefail

MODE="${1:-quick}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "error: Docker is not running. Strix needs it for sandboxed testing." >&2
  exit 1
fi

if ! command -v strix >/dev/null 2>&1; then
  echo "Strix not found; installing..."
  curl -sSL https://strix.ai/install | bash
fi

cd "$ROOT"
# Commit or stash first: Strix mounts the target directory writable.
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "warning: working tree has uncommitted changes; Strix can edit files in place." >&2
fi

strix -n -t ./ --scan-mode "$MODE" \
  --instruction-file .github/strix-instruction.md \
  --max-budget 10
status=$?

case "$status" in
  0) echo "Strix: no vulnerabilities found." ;;
  2) echo "Strix: confirmed vulnerabilities. Opening the report viewer..." >&2
     strix view || true ;;
  *) echo "Strix: fatal error (exit $status). Check credentials/Docker." >&2 ;;
esac
exit "$status"
