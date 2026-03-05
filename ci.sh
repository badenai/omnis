#!/usr/bin/env bash
set -uo pipefail

PASS=0
FAIL=0
FAILURES=()

# Load deploy config
source "$(dirname "$0")/.ci.env"

# ── Helpers ────────────────────────────────────────────────────────────────────

section() {
    printf '\n\033[1;33m══  %s  ══\033[0m\n' "$1"
}

run_step() {
    local name="$1"
    shift
    printf '  \033[1;34m▶ %s\033[0m\n' "$name"
    if "$@"; then
        printf '  \033[1;32m✓ %s\033[0m\n' "$name"
        (( PASS++ )) || true
    else
        printf '  \033[1;31m✗ %s\033[0m\n' "$name"
        (( FAIL++ )) || true
        FAILURES+=("$name")
    fi
}

print_failures() {
    printf '\n\033[1;31mFailed steps:\033[0m\n'
    for f in "${FAILURES[@]}"; do
        printf '  ✗ %s\n' "$f"
    done
}

ssh_ct() {
    ssh -o StrictHostKeyChecking=no -o BatchMode=yes \
        -i "${SSH_KEY:-$HOME/.ssh/id_ed25519_deploy}" \
        "$CONTAINER_USER@$CONTAINER_HOST" "$@"
}

# ── Stage 1: Quality gates ─────────────────────────────────────────────────────

section "STAGE 1 — Quality gates"

run_step "Python tests"     uv run pytest --tb=short -q
run_step "TypeScript check" bash -c "cd web && npm run typecheck"
run_step "ESLint"           bash -c "cd web && npm run lint"

if [ "$FAIL" -gt 0 ]; then
    print_failures
    exit 1
fi

# ── Stage 2: Build ─────────────────────────────────────────────────────────────

section "STAGE 2 — Build"

run_step "Frontend build" bash -c "cd web && npm run build"

if [ "$FAIL" -gt 0 ]; then
    print_failures
    exit 1
fi

# ── Stage 3: Deploy ────────────────────────────────────────────────────────────

section "STAGE 3 — Deploy → $CONTAINER_HOST"

run_step "git pull" \
    ssh_ct "cd $APP_DIR && git pull --ff-only origin $GIT_BRANCH"

run_step "sync dist" \
    rsync -az --delete \
        -e "ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i ${SSH_KEY:-$HOME/.ssh/id_ed25519_deploy}" \
        web/dist/ "$CONTAINER_USER@$CONTAINER_HOST:$APP_DIR/web/dist/"

run_step "uv sync" \
    ssh_ct "cd $APP_DIR && /root/.local/bin/uv sync --frozen"

run_step "restart" \
    ssh_ct "systemctl restart omnis"

run_step "health" \
    bash -c "sleep 2 && curl -sf http://$CONTAINER_HOST/api/agents >/dev/null"

# ── Summary ────────────────────────────────────────────────────────────────────

if [ "$FAIL" -gt 0 ]; then
    print_failures
    exit 1
fi

printf '\n\033[1;32m✓  All %d steps passed — deployed to %s\033[0m\n' \
    "$PASS" "$CONTAINER_HOST"
