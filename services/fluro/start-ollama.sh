#!/bin/bash
export OLLAMA_HOST=0.0.0.0:11434
export OLLAMA_MODELS=$(pwd)/data/ollama-models
export OLLAMA_ORIGINS="*"
export OLLAMA_NOHISTORY=true
exec ollama serve
