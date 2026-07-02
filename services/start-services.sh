#!/bin/bash
# Genova Genova — Start All Services
# Uses double-fork to fully detach from parent process

LOG_DIR="/tmp/genova-logs"
mkdir -p "$LOG_DIR"

start_detached() {
  local name=$1
  local command=$2
  local workdir=$3
  local logfile="$LOG_DIR/${name}.log"
  
  # Double fork to fully detach from parent
  (cd "$workdir" && nohup $command > "$logfile" 2>&1 &)
  
  echo "[$name] Started"
}

# 1. Baileys WhatsApp
start_detached "baileys" "node server.js" "$(pwd)/services/baileys"

sleep 1

# 2. Ruflo MCP
start_detached "ruflo" "node server.mjs" "$(pwd)/services/ruflo"

sleep 1

# 3. PocketBase
start_detached "pocketbase" "$(pwd)/services/pocketbase/pocketbase serve --http=0.0.0.0:8090" "$(pwd)/services/pocketbase"

sleep 1

# 4. n8n
export N8N_BASIC_AUTH_ACTIVE=true
export N8N_BASIC_AUTH_USER=admin
export N8N_BASIC_AUTH_PASSWORD=genova_admin
export N8N_PORT=5678
export WEBHOOK_URL=http://localhost:5678/
start_detached "n8n" "n8n start" "$(pwd)/services"

sleep 1

# 5. SpeechBrain
start_detached "speechbrain" "python3 $(pwd)/services/speechbrain_api_server.py" "$(pwd)/services"

echo "All services started"
