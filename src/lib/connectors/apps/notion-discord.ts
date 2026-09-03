/**
 * Notion — API publique v1 (https://developers.notion.com).
 * Auth : internal integration token (secret_…) en import direct.
 */

import type { AppDefinition } from "../core/types"

export function notionApp(): AppDefinition {
  return {
    slug: "notion",
    name: "Notion",
    description: "Pages, bases de données et blocs Notion (API v1, version 2022-06-28).",
    category: "PRODUCTIVITY",
    logo: "📓",
    docsUrl: "https://developers.notion.com/reference/intro",
    baseUrl: "https://api.notion.com/v1",
    authScheme: "BEARER_TOKEN",
    supportsTokenImport: true,
    apiKeyEnv: { envVars: ["NOTION_API_KEY", "NOTION_TOKEN"], label: "Internal integration token (secret_…)" },
    tokenImportAuth: { style: "bearer" },
    actions: [
      {
        slug: "search",
        name: "Rechercher",
        description: "Recherche pages et databases partagées avec l'intégration.",
        method: "POST",
        path: "/search",
        params: [
          { name: "query", type: "string", description: "Texte recherché", required: false, in: "body" },
          { name: "page_size", type: "integer", description: "Résultats par page (max 100)", required: false, in: "query", default: 20 },
        ],
        headers: { "Notion-Version": "2022-06-28" },
        maxOutputChars: 8000,
      },
      {
        slug: "create_page",
        name: "Créer une page",
        description: "Crée une page sous un parent (page ou database).",
        method: "POST",
        path: "/pages",
        headers: { "Notion-Version": "2022-06-28" },
        params: [
          { name: "parent_page_id", type: "string", description: "ID de la page parente (32 char hex)", required: true, in: "body" },
          { name: "title", type: "string", description: "Titre de la page", required: true, in: "body" },
        ],
        prepare: (params) => ({
          parent: { page_id: String(params.parent_page_id ?? "").replace(/-/g, "") },
          properties: {
            title: {
              title: [{ text: { content: String(params.title ?? "") } }],
            },
          },
        }),
      },
      {
        slug: "get_page",
        name: "Lire une page",
        description: "Récupère les propriétés d'une page.",
        method: "GET",
        path: "/pages/{page_id}",
        headers: { "Notion-Version": "2022-06-28" },
        params: [
          { name: "page_id", type: "string", description: "ID de la page", required: true, in: "path" },
        ],
      },
      {
        slug: "append_blocks",
        name: "Ajouter des blocs",
        description: "Ajoute du contenu Markdown-like (blocs paragraphes) à la fin d'une page.",
        method: "PATCH",
        path: "/blocks/{block_id}/children",
        headers: { "Notion-Version": "2022-06-28" },
        params: [
          { name: "block_id", type: "string", description: "ID de la page/bloc parent", required: true, in: "path" },
          { name: "text", type: "string", description: "Contenu à ajouter (un paragraphe par ligne vide)", required: true, in: "body" },
        ],
        prepare: (params) => {
          const paragraphs = String(params.text ?? "")
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean)
          return {
            children: paragraphs.map((p) => ({
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ type: "text", text: { content: p.slice(0, 2000) } }] },
            })),
          }
        },
      },
      {
        slug: "query_database",
        name: "Interroger une base",
        description: "Exécute une requête sur une database Notion (tri optionnel).",
        method: "POST",
        path: "/databases/{database_id}/query",
        headers: { "Notion-Version": "2022-06-28" },
        params: [
          { name: "database_id", type: "string", description: "ID de la database", required: true, in: "path" },
          { name: "page_size", type: "integer", description: "Résultats (max 100)", required: false, in: "body", default: 20 },
        ],
        prepare: (params) => ({ page_size: params.page_size ?? 20 }),
        maxOutputChars: 8000,
      },
    ],
  }
}

/**
 * Discord — Bot API v10. Import du bot token (header « Bot »).
 */
export function discordApp(): AppDefinition {
  return {
    slug: "discord",
    name: "Discord",
    description: "Messages et canaux Discord via un bot (API v10).",
    category: "COMMUNICATION",
    logo: "🎮",
    docsUrl: "https://discord.com/developers/docs/reference",
    baseUrl: "https://discord.com/api/v10",
    authScheme: "BEARER_TOKEN",
    supportsTokenImport: true,
    apiKeyEnv: { envVars: ["DISCORD_BOT_TOKEN", "DISCORD_API_KEY"], label: "Bot token (MTIz…)" },
    tokenImportAuth: { style: "header", name: "Authorization", template: "Bot {{token}}" },
    actions: [
      {
        slug: "get_me",
        name: "Identité du bot",
        description: "Récupère l'utilisateur bot connecté.",
        method: "GET",
        path: "/users/@me",
        params: [],
      },
      {
        slug: "list_guilds",
        name: "Serveurs du bot",
        description: "Liste les serveurs (guilds) où le bot est membre.",
        method: "GET",
        path: "/users/@me/guilds",
        params: [],
        maxOutputChars: 5000,
      },
      {
        slug: "list_guild_channels",
        name: "Canaux d'un serveur",
        description: "Liste les canaux textuels d'un serveur.",
        method: "GET",
        path: "/guilds/{guild_id}/channels",
        params: [
          { name: "guild_id", type: "string", description: "ID du serveur", required: true, in: "path" },
        ],
        maxOutputChars: 8000,
      },
      {
        slug: "send_message",
        name: "Envoyer un message",
        description: "Publie un message dans un canal.",
        method: "POST",
        path: "/channels/{channel_id}/messages",
        params: [
          { name: "channel_id", type: "string", description: "ID du canal", required: true, in: "path" },
          { name: "content", type: "string", description: "Contenu du message (max 2000)", required: true, in: "body" },
        ],
      },
      {
        slug: "list_messages",
        name: "Messages d'un canal",
        description: "Récupère les derniers messages d'un canal.",
        method: "GET",
        path: "/channels/{channel_id}/messages",
        params: [
          { name: "channel_id", type: "string", description: "ID du canal", required: true, in: "path" },
          { name: "limit", type: "integer", description: "Nombre de messages (max 100)", required: false, in: "query", default: 50 },
        ],
        maxOutputChars: 8000,
      },
      {
        slug: "create_channel",
        name: "Créer un canal",
        description: "Crée un canal texte dans un serveur.",
        method: "POST",
        path: "/guilds/{guild_id}/channels",
        params: [
          { name: "guild_id", type: "string", description: "ID du serveur", required: true, in: "path" },
          { name: "name", type: "string", description: "Nom du canal (sans espace)", required: true, in: "body" },
          { name: "topic", type: "string", description: "Topic du canal", required: false, in: "body" },
        ],
        prepare: (params) => ({
          name: String(params.name ?? "").replace(/\s+/g, "-").toLowerCase(),
          type: 0, // GUILD_TEXT
          ...(params.topic ? { topic: params.topic } : {}),
        }),
      },
    ],
  }
}
