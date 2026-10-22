#!/usr/bin/env bash
# Sets up Workify on a fresh Ubuntu VM (made for Oracle Cloud "Always Free").
# Run from the cloned repo:  bash deploy/oracle-setup.sh your-name.duckdns.org
set -euo pipefail

DOMAIN="${1:?Usage: bash deploy/oracle-setup.sh your-name.duckdns.org}"
cd "$(dirname "$0")/.."

echo "==> 1/4 Opening ports 80 and 443 in the VM firewall"
# Oracle's Ubuntu images REJECT all inbound traffic except SSH in iptables, even
# when the cloud Security List allows it. Insert ACCEPT rules before that REJECT.
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
    reject_line=$(sudo iptables -L INPUT --line-numbers | awk '$2=="REJECT" {print $1; exit}')
    if [ -n "$reject_line" ]; then
      sudo iptables -I INPUT "$reject_line" -p tcp -m state --state NEW --dport "$port" -j ACCEPT
    else
      sudo iptables -A INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT
    fi
  fi
done
# Save now, before Docker adds its own rules, so the saved set stays clean.
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent >/dev/null
sudo netfilter-persistent save >/dev/null

echo "==> 2/4 Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER" || true

echo "==> 3/4 Adding swap if the machine has little memory"
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 3500 ] && ! swapon --show | grep -q .; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> 4/4 Building and starting Workify for https://$DOMAIN (first build: 20-40 min)"
echo "DOMAIN=$DOMAIN" > .env
sudo docker compose up -d --build

echo
echo "Done. Open https://$DOMAIN in a minute (Caddy is getting the HTTPS certificate)."
echo "Logs:    sudo docker compose logs -f app"
echo "Update:  git pull && sudo docker compose up -d --build"
