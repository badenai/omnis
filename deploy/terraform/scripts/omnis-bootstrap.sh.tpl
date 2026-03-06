#!/bin/bash
set -e

apt-get update -q && apt-get install -y git curl

# Trust GitHub host key and configure deploy key
mkdir -p /root/.ssh
chmod 700 /root/.ssh
ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts
chmod 600 /root/.ssh/known_hosts
cat > /root/.ssh/config << 'EOF'
Host github.com
    IdentityFile /root/.ssh/github_deploy_key
    StrictHostKeyChecking no
EOF
chmod 600 /root/.ssh/config


curl -LsSf https://astral.sh/uv/install.sh | sh

if [ -d /opt/omnis/.git ]; then
  git -C /opt/omnis pull
else
  rm -rf /opt/omnis
  git clone ${git_repo} /opt/omnis
fi
cd /opt/omnis && /root/.local/bin/uv sync

cp /opt/omnis/deploy/omnis.service /etc/systemd/system/omnis.service
systemctl daemon-reload
systemctl enable omnis

echo "GEMINI_API_KEY=${gemini_api_key}" > /opt/omnis/.env

systemctl restart omnis
