# 🔌 Connexion MCP — Genova AI

Genova expose un serveur **MCP (Model Context Protocol)** pour permettre aux IDE et assistants AI de se connecter directement à vos agents Genova.

## 📋 Outils exposés

| Outil | Description |
|-------|-------------|
| `genova_list_agents` | Liste tous vos agents AI |
| `genova_get_agent` | Détails d'un agent spécifique |
| `genova_execute_agent` | Exécute une tâche sur un agent |
| `genova_list_workflows` | Liste vos workflows |
| `genova_list_conversations` | Liste vos conversations |
| `genova_get_credits` | Vérifie votre solde de crédits |
| `genova_create_agent` | Crée un nouvel agent |
| `genova_search_memory` | Recherche dans la mémoire |
| `genova_get_usage` | Statistiques d'utilisation |

## 🔧 Configuration

### Pour Cursor IDE

1. Générez une **clé API** depuis Genova > Clés API
2. Dans Cursor, allez dans **Settings > MCP Servers**
3. Ajoutez :

```json
{
  "name": "genova",
  "type": "api-key",
  "apiKey": "gva_votre_cle_ici",
  "baseUrl": "https://votre-instance-genova.com"
}
```

### Pour Claude Desktop

Ajoutez dans `claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "genova": {
      "url": "https://votre-instance-genova.com/api/mcp",
      "headers": {
        "Authorization": "Bearer gva_votre_cle_ici"
      }
    }
  }
}
```

### Pour tout client MCP

```bash
# Découverte du serveur
curl https://votre-instance-genova.com/api/mcp

# Lister les outils
curl -X POST https://votre-instance-genova.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer gva_votre_cle_ici" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Exécuter un outil
curl -X POST https://votre-instance-genova.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer gva_votre_cle_ici" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"genova_list_agents","arguments":{}}}'
```

## 🔒 Authentification

- **Session web :** Les utilisateurs connectés sur l'interface Genova peuvent utiliser l'API MCP directement
- **API Key :** Les clients externes (Cursor, Claude) doivent utiliser une clé API avec `Authorization: Bearer gva_...`

> Les clés API sont réservées aux abonnements **Starter** (3 clés), **Pro** (10 clés) et **Enterprise** (50 clés).

## API Endpoint

```
POST https://votre-instance-genova.com/api/mcp
Content-Type: application/json
Authorization: Bearer gva_votre_cle_api
```

## Protocole

Genova MCP Server implémente la spécification **MCP 2025-03-26** avec :
- ✅ `initialize`
- ✅ `tools/list`
- ✅ `tools/call`
- ✅ `resources/list`
- ✅ `resources/read`
- ✅ `prompts/list`
- ✅ `prompts/get`
