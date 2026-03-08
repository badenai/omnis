#!/usr/bin/env bash
# Usage: sync-agent.sh <agent-id> [--ssh-key=/path/to/key] [--restart]
#
# Copies a single agent from ~/.omnis/agents/<agent-id>/ to the deployment
# server and optionally restarts the omnis service.
set -e

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DEPLOY_DIR/.ci.env"

AGENT_ID=""
RESTART=false
LOCAL_AGENTS_DIR="$HOME/.omnis/agents"

for arg in "$@"; do
  case $arg in
    --ssh-key=*)          SSH_KEY="${arg#*=}" ;;
    --local-agents-dir=*) LOCAL_AGENTS_DIR="${arg#*=}" ;;
    --restart)            RESTART=true ;;
    -*)                   echo "Unknown flag: $arg"; exit 1 ;;
    *)                    AGENT_ID="$arg" ;;
  esac
done

if [[ -z "$AGENT_ID" ]]; then
  echo "Usage: sync-agent.sh <agent-id> [--ssh-key=/path/to/key] [--restart]"
  exit 1
fi

LOCAL_DIR="$LOCAL_AGENTS_DIR/$AGENT_ID"
if [[ ! -d "$LOCAL_DIR" ]]; then
  echo "Agent not found locally: $LOCAL_DIR"
  exit 1
fi

# If key is on a Windows mount (/mnt/...), SSH rejects 0777 permissions.
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
REMOTE_DIR="/root/.omnis/agents/$AGENT_ID"

echo "Syncing agent '$AGENT_ID' → $CONTAINER_HOST:$REMOTE_DIR ..."
rsync -az --delete \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  -e "ssh $SSH_OPTS" \
  "$LOCAL_DIR/" "$CONTAINER_USER@$CONTAINER_HOST:$REMOTE_DIR/"

echo "Sync complete."

if [[ "$RESTART" == "true" ]]; then
  echo "Restarting omnis service..."
  $SSH_CMD "systemctl restart omnis"
  sleep 2
  $SSH_CMD "systemctl is-active omnis && echo OK"
else
  echo "Run with --restart to pick up the new agent, or restart manually:"
  echo "  ssh $CONTAINER_USER@$CONTAINER_HOST 'systemctl restart omnis'"
fi
