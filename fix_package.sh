#!/bin/bash
# Script de correction du package.json
# Ajoute les dépendances manquantes et nettoie les scripts invalides

# Ajouter vitest et @playwright/test aux devDependencies si ils manquent
jq '.devDependencies += {"vitest": "^3.1.3", "@playwright/test": "^1.52.0"}' package.json | jq 'del(.scripts["@playwright/test"])' > package.json.tmp && mv package.json.tmp package.json

echo "package.json corrigé avec succès"
