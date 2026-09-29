#!/usr/bin/env bash
# Flux Local LAN HTTPS launcher for macOS & Linux
# Enables WebRTC, File System Access API, and Camera QR scanning over local Wi-Fi.

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo -e "\033[1;36m========================================================\033[0m"
echo -e "\033[1;36m         Flux Local LAN HTTPS (Direct P2P)              \033[0m"
echo -e "\033[1;36m========================================================\033[0m"

# Build binary if missing
if [ ! -f "$ROOT_DIR/flux-server" ]; then
    echo -e "\033[0;33mBuilding flux-server binary...\033[0m"
    go build -o flux-server ./server
fi

# Detect LAN IP on macOS (en0/en1) or Linux
LAN_IP="127.0.0.1"
if command -v ip >/dev/null 2>&1; then
    LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' || hostname -I | awk '{print $1}')
elif command -v ifconfig >/dev/null 2>&1; then
    LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
fi

CERT_FILE="$ROOT_DIR/cert.pem"
KEY_FILE="$ROOT_DIR/key.pem"

# Check or generate certificates with mkcert
if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    if command -v mkcert >/dev/null 2>&1; then
        echo -e "\033[0;33mGenerating trusted TLS certificate with mkcert for $LAN_IP, localhost, 127.0.0.1...\033[0m"
        mkcert -cert-file "$CERT_FILE" -key-file "$KEY_FILE" "$LAN_IP" localhost 127.0.0.1
    elif command -v openssl >/dev/null 2>&1; then
        echo -e "\033[0;33mGenerating self-signed TLS certificate with OpenSSL...\033[0m"
        openssl req -x509 -newkey rsa:2048 -nodes -keyout "$KEY_FILE" -out "$CERT_FILE" -days 365 -subj "/CN=$LAN_IP"
    fi
fi

export FLUX_ADDR=":8080"
export FLUX_CERT_FILE="$CERT_FILE"
export FLUX_KEY_FILE="$KEY_FILE"

LAN_URL="https://${LAN_IP}:8080"

echo -e "\n\033[1;32m================================================================\033[0m"
echo -e "\033[1;32m           🔒 FLUX LOCAL LAN HTTPS READY! 🔒                    \033[0m"
echo -e "\033[1;32m================================================================\033[0m"
echo -e "  LAN HTTPS URL      :  \033[1;33m$LAN_URL\033[0m"
echo -e "  Localhost HTTPS    :  \033[1;36mhttps://localhost:8080\033[0m"
echo -e "\033[1;32m================================================================\033[0m"
echo -e "\033[1;32mOpen $LAN_URL on any nearby phone, tablet, or laptop on your Wi-Fi!\033[0m\n"

# Launch browser if supported
if [[ "$*" != *"--no-browser"* ]]; then
    if command -v open >/dev/null 2>&1; then
        open "$LAN_URL" || true
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$LAN_URL" || true
    fi
fi

exec ./flux-server
