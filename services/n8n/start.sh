#!/bin/bash
# n8n Workflow Engine for Genova Genova
# Runs on port 5678 with data stored locally

export N8N_PORT=5678
export N8N_PROTOCOL=http
export N8N_HOST=localhost
export N8N_EDITOR_BASE_URL=http://localhost:5678
export N8N_USER_FOLDER=$(pwd)/services/n8n
export N8N_CUSTOM_EXTENSIONS=$(pwd)/services/n8n/extensions
export WEBHOOK_URL=http://localhost:5678/

cd $(pwd)
npx n8n start
