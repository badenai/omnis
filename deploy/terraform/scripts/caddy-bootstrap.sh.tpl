#!/bin/bash
set -e

if ! command -v caddy &> /dev/null; then
  apt-get update -q
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y caddy
fi

cat > /etc/caddy/Caddyfile << 'EOF'
${domain} {
%{ if length(users) > 0 ~}
    basicauth {
%{ for username, hash in users ~}
        ${username} ${hash}
%{ endfor ~}
    }
%{ endif ~}
    reverse_proxy ${omnis_ip}:8420
}
EOF

systemctl enable caddy
systemctl reload-or-restart caddy
