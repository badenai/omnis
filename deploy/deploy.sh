#!/usr/bin/env bash
set -e

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"

# Load config
source "$DEPLOY_DIR/.ci.env"

# Parse flags
SKIP_BUILD=false
for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
    --ssh-key=*)  SSH_KEY="${arg#*=}" ;;
  esac
done

# If key is on a Windows mount (/mnt/...), SSH rejects it due to 0777 permissions.
# Copy to a WSL-native tmp file with correct permissions.
if [[ "$SSH_KEY" == /mnt/* ]]; then
  _TMP_KEY=$(mktemp)
  cp "$SSH_KEY" "$_TMP_KEY"
  chmod 600 "$_TMP_KEY"
  trap "rm -f $_TMP_KEY" EXIT
  SSH_KEY="$_TMP_KEY"
fi

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"
SSH_CMD="ssh $SSH_OPTS $CONTAINER_USER@$CONTAINER_HOST"

if [[ "$SKIP_BUILD" != "true" ]]; then
  echo "Building frontend..."
  cd "$ROOT_DIR/web"
  npm install --silent
  npm run build
  cd "$ROOT_DIR"
fi

echo "Syncing files..."
rsync -az --delete \
  --exclude='.git' \
  --exclude='web/node_modules' \
  --exclude='web/src' \
  --exclude='web/public' \
  --exclude='__pycache__' \
  --exclude='.venv' \
  --exclude='deploy/terraform' \
  --exclude='*.pyc' \
  -e "ssh $SSH_OPTS" \
  . "$CONTAINER_USER@$CONTAINER_HOST:$APP_DIR/"

echo "Installing Python deps..."
$SSH_CMD "cd $APP_DIR && /root/.local/bin/uv sync --no-dev"

echo "Restarting service..."
$SSH_CMD "systemctl restart omnis"

echo "Health check..."
sleep 2
$SSH_CMD "systemctl is-active omnis && echo OK"
