#!/bin/bash
# ============================================================
# keep-nextjs-alive.sh — Heartbeat pour Render
# Empêche le service de s'endormir sur les plans gratuits
# Usage: nohup ./keep-nextjs-alive.sh &
# ============================================================

URL="${1:-http://localhost:3000}"
INTERVAL="${2:-300}"  # 5 minutes

echo "💓 Heartbeat démarré — $URL toutes les ${INTERVAL}s"

while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL/api/health" 2>/dev/null || echo "000")
  echo "$(date '+%H:%M:%S') — $STATUS"
  sleep "$INTERVAL"
done
