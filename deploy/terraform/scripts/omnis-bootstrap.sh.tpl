#!/bin/bash
set -e

apt-get update -q && apt-get install -y curl nodejs npm

curl -LsSf https://astral.sh/uv/install.sh | sh

mkdir -p /opt/omnis

cat > /opt/omnis/.env <<'ENVEOF'
GEMINI_API_KEY=${gemini_api_key}
GITHUB_TOKEN=${github_token}
GITHUB_MARKETPLACE_REPO=${github_marketplace_repo}
GITHUB_MARKETPLACE_BRANCH=${github_marketplace_branch}
ENVEOF

cp /opt/omnis/deploy/omnis.service /etc/systemd/system/omnis.service || true
systemctl daemon-reload
systemctl enable omnis
