/**
 * Slack — Web API (https://api.slack.com/methods).
 * Auth : OAuth2 (bot + user scopes) ou import de token bot/user.
 * Normalisation native du pattern `ok:false` (voir executor).
 */

import type { AppDefinition } from "../core/types"

export function slackApp(): AppDefinition {
  return {
    slug: "slack",
    name: "Slack",
    description:
      "Messages, canaux et réactions Slack (Web API conversations/chat).",
    category: "COMMUNICATION",
    logo: "💬",
    docsUrl: "https://api.slack.com/methods",
    baseUrl: "https://slack.com/api",
    authScheme: "OAUTH2",
    oauth2: {
      clientId: process.env.SLACK_CLIENT_ID ?? "",
      clientSecret: process.env.SLACK_CLIENT_SECRET ?? "",
      authorizeUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: ["chat:write", "channels:read", "channels:history", "users:read", "reactions:write", "groups:read"],
      userScopes: [],
      revokeUrl: "https://slack.com/api/auth.revoke",
    },
    supportsTokenImport: true,
    apiKeyEnv: { envVars: ["SLACK_BOT_TOKEN", "SLACK_API_KEY"], label: "Token bot (xoxb-…) ou user (xoxp-…)" },
    tokenImportAuth: { style: "bearer" },
    actions: [
      {
        slug: "send_message",
        name: "Envoyer un message",
        description: "Publie un message dans un canal Slack (ou MP, via ID utilisateur).",
        method: "POST",
        path: "/chat.postMessage",
        params: [
          { name: "channel", type: "string", description: "ID du canal (ex: C01234567) ou utilisateur", required: true, in: "body" },
          { name: "text", type: "string", description: "Texte du message (mrkdwn supporté)", required: true, in: "body" },
          { name: "thread_ts", type: "string", description: "Timestamp du message parent (réponse en fil)", required: false, in: "body" },
        ],
      },
      {
        slug: "list_channels",
        name: "Lister les canaux",
        description: "Liste les canaux de l'espace de travail.",
        method: "GET",
        path: "/conversations.list",
        params: [
          { name: "types", type: "string", description: "Types séparés par virgules (public_channel,private_channel)", required: false, in: "query", default: "public_channel" },
          { name: "limit", type: "integer", description: "Nombre maximum (200 max)", required: false, in: "query", default: 100 },
        ],
        maxOutputChars: 8000,
      },
      {
        slug: "list_messages",
        name: "Historique d'un canal",
        description: "Récupère les derniers messages d'un canal.",
        method: "GET",
        path: "/conversations.history",
        params: [
          { name: "channel", type: "string", description: "ID du canal", required: true, in: "query" },
          { name: "limit", type: "integer", description: "Nombre de messages (défaut 50)", required: false, in: "query", default: 50 },
        ],
        maxOutputChars: 8000,
      },
      {
        slug: "create_channel",
        name: "Créer un canal",
        description: "Crée un canal public ou privé.",
        method: "POST",
        path: "/conversations.create",
        params: [
          { name: "name", type: "string", description: "Nom du canal (minuscules, sans espace)", required: true, in: "body" },
          { name: "is_private", type: "boolean", description: "Canal privé", required: false, in: "body", default: false },
        ],
      },
      {
        slug: "get_user",
        name: "Infos utilisateur",
        description: "Récupère le profil d'un membre Slack.",
        method: "GET",
        path: "/users.info",
        params: [
          { name: "user", type: "string", description: "ID utilisateur (ex: U01234567)", required: true, in: "query" },
        ],
      },
      {
        slug: "add_reaction",
        name: "Ajouter une réaction",
        description: "Ajoute un emoji en réaction à un message.",
        method: "POST",
        path: "/reactions.add",
        params: [
          { name: "channel", type: "string", description: "ID du canal", required: true, in: "body" },
          { name: "timestamp", type: "string", description: "Timestamp du message", required: true, in: "body" },
          { name: "name", type: "string", description: "Nom de l'emoji (ex: thumbsup)", required: true, in: "body" },
        ],
      },
      {
        slug: "auth_test",
        name: "Tester la connexion",
        description: "Vérifie l'identité du token (bot ou utilisateur) et l'équipe.",
        method: "GET",
        path: "/auth.test",
        params: [],
      },
    ],
  }
}
