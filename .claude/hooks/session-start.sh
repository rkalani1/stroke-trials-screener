#!/bin/bash
# SessionStart hook: surface any breakage in the single-file app early.
#
# This repo is a dependency-free static PWA whose entire app lives in
# index.html. The regression suite (tests/screener.test.mjs) loads the inline
# logic and fuzzes the eligibility engine using only the Node.js stdlib test
# runner, so there is nothing to `npm install`. We just run it and report.
#
# Runs only in Claude Code on the web; never blocks session startup.
set -uo pipefail

# Web (remote) sessions only.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if command -v npm >/dev/null 2>&1; then
  echo "[session-start] running regression suite (npm test)..."
  if npm test --silent 2>&1 | tail -n 15; then
    echo "[session-start] regression suite passed."
  else
    echo "[session-start] WARNING: regression suite reported failures (see above)."
  fi
else
  echo "[session-start] node/npm not found; skipping regression suite."
fi

# Never block session startup on a test result.
exit 0
