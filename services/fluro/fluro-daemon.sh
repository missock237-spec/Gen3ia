#!/bin/bash
export OLLAMA_HOST=127.0.0.1:11434
export OLLAMA_MODELS=$(pwd)/data/ollama-models
export OLLAMA_ORIGINS="*"
export OLLAMA_NOHISTORY=true
export HOME=$HOME

while true; do
  echo "[$(date)] Starting Fluro (Ollama) server..."
  ollama serve 2>&1
  echo "[$(date)] Fluro server exited with code $?. Restarting in 3s..."
  sleep 3
done
