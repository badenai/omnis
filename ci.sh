#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"



PASS=0
FAIL=0
FAILURES=()

# ── Helpers ────────────────────────────────────────────────────────────────────

section() {
    printf '\n\033[1;33m==  %s  ==\033[0m\n' "$1"
}

run_step() {
    local name="$1"
    shift
    printf '  \033[1;34m> %s\033[0m\n' "$name"
    if "$@"; then
        printf '  \033[1;32m[PASS] %s\033[0m\n' "$name"
        (( PASS++ )) || true
    else
        printf '  \033[1;31m[FAIL] %s\033[0m\n' "$name"
        (( FAIL++ )) || true
        FAILURES+=("$name")
    fi
}

print_failures() {
    printf '\n\033[1;31mFailed steps:\033[0m\n'
    for f in "${FAILURES[@]}"; do
        printf '  [FAIL] %s\n' "$f"
    done
}

# ── Stage 1: Quality gates ─────────────────────────────────────────────────────

section "STAGE 1 - Quality gates"

run_step "Python tests"     uv run pytest --tb=short -q
run_step "TypeScript check" bash -c "cd web && npm run typecheck"
run_step "ESLint"           bash -c "cd web && npm run lint"

if [ "$FAIL" -gt 0 ]; then
    print_failures
    exit 1
fi

# ── Stage 2: Build ─────────────────────────────────────────────────────────────

section "STAGE 2 - Build"

run_step "Frontend build" bash -c "cd web && npm run build"

if [ "$FAIL" -gt 0 ]; then
    print_failures
    exit 1
fi

# ── Summary ────────────────────────────────────────────────────────────────────

printf '\n\033[1;32m[PASS]  All %d steps passed\033[0m\n' "$PASS"
