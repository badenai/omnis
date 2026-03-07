#!/usr/bin/env bash
# Usage: fetch-agent.sh <agent-id> [--ssh-key=/path/to/key]
#
# Copies a single agent from the deployment server back into ~/.omnis/agents/<agent-id>/.
set -e

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DEPLOY_DIR/.ci.env"

AGENT_ID=""
LOCAL_AGENTS_DIR="$HOME/.omnis/agents"

for arg in "$@"; do
  case $arg in
    --ssh-key=*)          SSH_KEY="${arg#*=}" ;;
    --local-agents-dir=*) LOCAL_AGENTS_DIR="${arg#*=}" ;;
    -*)                   echo "Unknown flag: $arg"; exit 1 ;;
    *)                    AGENT_ID="$arg" ;;
  esac
done

if [[ -z "$AGENT_ID" ]]; then
  echo "Usage: fetch-agent.sh <agent-id> [--ssh-key=/path/to/key]"
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
REMOTE_DIR="/root/.omnis/agents/$AGENT_ID"
LOCAL_DIR="$LOCAL_AGENTS_DIR/$AGENT_ID"

echo "Fetching agent '$AGENT_ID' from $CONTAINER_HOST:$REMOTE_DIR ..."
mkdir -p "$LOCAL_DIR"
rsync -az \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  -e "ssh $SSH_OPTS" \
  "$CONTAINER_USER@$CONTAINER_HOST:$REMOTE_DIR/" "$LOCAL_DIR/"

echo "Fetch complete → $LOCAL_DIR"
