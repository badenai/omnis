#!/bin/bash
set -e

apt-get update -q && apt-get install -y curl nodejs npm

curl -LsSf https://astral.sh/uv/install.sh | sh

mkdir -p /opt/omnis

echo "GEMINI_API_KEY=${gemini_api_key}" > /opt/omnis/.env

cp /opt/omnis/deploy/omnis.service /etc/systemd/system/omnis.service || true
systemctl daemon-reload
systemctl enable omnis
