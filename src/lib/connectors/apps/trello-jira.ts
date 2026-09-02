/**
 * Trello — plateforme API v1 (https://developer.atlassian.com/cloud/trello/rest).
 * Auth : OAuth 1.0a (three-legged, HMAC-SHA1 — voir core/oauth1.ts).
 */

import type { AppDefinition } from "../core/types"

export function trelloApp(): AppDefinition {
  return {
    slug: "trello",
    name: "Trello",
    description: "Tableaux, listes et cartes Trello (API v1, OAuth1.0a).",
    category: "PRODUCTIVITY",
    logo: "📋",
    docsUrl: "https://developer.atlassian.com/cloud/trello/rest/api-intro/",
    baseUrl: "https://api.trello.com/1",
    authScheme: "OAUTH1",
    oauth1: {
      consumerKey: process.env.TRELLO_CONSUMER_KEY ?? "",
      consumerSecret: process.env.TRELLO_CONSUMER_SECRET ?? "",
      requestTokenUrl: "https://trello.com/power-up/admin/oauth/request",
      authorizeUrl: "https://trello.com/1/OAuthAuthorizeToken",
      accessTokenUrl: "https://trello.com/1/OAuthGetAccessToken",
      signatureMethod: "HMAC-SHA1",
    },
    supportsTokenImport: false,
    actions: [
      {
        slug: "list_boards",
        name: "Mes tableaux",
        description: "Liste les tableaux du membre connecté.",
        method: "GET",
        path: "/members/me/boards",
        auth: { style: "oauth1" },
        params: [
          { name: "filter", type: "enum", description: "Filtre des tableaux", required: false, in: "query", enum: ["all", "open", "closed"], default: "open" },
        ],
        maxOutputChars: 8000,
      },
      {
        slug: "create_board",
        name: "Créer un tableau",
        description: "Crée un tableau Trello.",
        method: "POST",
        path: "/boards",
        auth: { style: "oauth1" },
        params: [
          { name: "name", type: "string", description: "Nom du tableau", required: true, in: "body" },
          { name: "defaultLabels", type: "boolean", description: "Labels par défaut", required: false, in: "query", default: true },
        ],
      },
      {
        slug: "list_lists",
        name: "Listes d'un tableau",
        description: "Liste les colonnes d'un tableau.",
        method: "GET",
        path: "/boards/{board_id}/lists",
        auth: { style: "oauth1" },
        params: [
          { name: "board_id", type: "string", description: "ID du tableau", required: true, in: "path" },
        ],
      },
      {
        slug: "create_card",
        name: "Créer une carte",
        description: "Ajoute une carte dans une liste.",
        method: "POST",
        path: "/cards",
        auth: { style: "oauth1" },
        params: [
          { name: "idList", type: "string", description: "ID de la liste cible", required: true, in: "query" },
          { name: "name", type: "string", description: "Titre de la carte", required: true, in: "query" },
          { name: "desc", type: "string", description: "Description", required: false, in: "query" },
        ],
      },
      {
        slug: "get_card",
        name: "Détail d'une carte",
        description: "Récupère une carte (desc, dates, checklist IDs).",
        method: "GET",
        path: "/cards/{card_id}",
        auth: { style: "oauth1" },
        params: [
          { name: "card_id", type: "string", description: "ID de la carte", required: true, in: "path" },
        ],
      },
      {
        slug: "add_comment",
        name: "Commenter une carte",
        description: "Ajoute un commentaire sur une carte.",
        method: "POST",
        path: "/cards/{card_id}/actions/comments",
        auth: { style: "oauth1" },
        params: [
          { name: "card_id", type: "string", description: "ID de la carte", required: true, in: "path" },
          { name: "text", type: "string", description: "Texte du commentaire", required: true, in: "query" },
        ],
      },
      {
        slug: "move_card",
        name: "Déplacer une carte",
        description: "Déplace une carte vers une autre liste.",
        method: "PUT",
        path: "/cards/{card_id}",
        auth: { style: "oauth1" },
        params: [
          { name: "card_id", type: "string", description: "ID de la carte", required: true, in: "path" },
          { name: "idList", type: "string", description: "ID de la liste de destination", required: true, in: "query" },
        ],
      },
    ],
  }
}

/**
 * Jira Cloud — REST v3. Auth Basic (email + token API Atlassian),
 * l'URL de base est résolue par domaine : https://{your-domain}.atlassian.com.
 */
export function jiraApp(): AppDefinition {
  return {
    slug: "jira",
    name: "Jira (Cloud)",
    description: "Issues, projets et commentaires Jira Cloud (REST v3, Basic auth).",
    category: "DEVELOPMENT",
    logo: "🧭",
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/",
    baseUrl: "https://{your-domain}.atlassian.com",
    authScheme: "BASIC",
    supportsTokenImport: false,
    actions: [
      {
        slug: "search_issues",
        name: "Rechercher des issues",
        description: "Recherche JQL sur les issues accessibles.",
        method: "POST",
        path: "/rest/api/3/search/jql",
        params: [
          { name: "jql", type: "string", description: "Requête JQL (ex: project = X AND status = \"To Do\")", required: true, in: "query" },
          { name: "maxResults", type: "integer", description: "Nombre max (défaut 20)", required: false, in: "query", default: 20 },
        ],
        maxOutputChars: 9000,
      },
      {
        slug: "create_issue",
        name: "Créer une issue",
        description: "Crée une issue (format ADF simplifié : texte).",
        method: "POST",
        path: "/rest/api/3/issue",
        params: [
          { name: "project", type: "string", description: "Clé ou ID du projet (ex: GEN)", required: true, in: "body" },
          { name: "issuetype", type: "string", description: "Nom du type (Task, Bug, Story…)", required: false, in: "body", default: "Task" },
          { name: "summary", type: "string", description: "Résumé de l'issue", required: true, in: "body" },
          { name: "description", type: "string", description: "Description texte", required: false, in: "body" },
        ],
        prepare: (params) => ({
          fields: {
            project: { key: String(params.project ?? "") },
            issuetype: { name: String(params.issuetype ?? "Task") },
            summary: String(params.summary ?? ""),
            ...(params.description
              ? {
                  description: {
                    type: "doc",
                    version: 1,
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: String(params.description).slice(0, 2000) }],
                      },
                    ],
                  },
                }
              : {}),
          },
        }),
      },
      {
        slug: "get_issue",
        name: "Détail d'une issue",
        description: "Récupère une issue par sa clé (GEN-123).",
        method: "GET",
        path: "/rest/api/3/issue/{issueKey}",
        params: [
          { name: "issueKey", type: "string", description: "Clé de l'issue", required: true, in: "path" },
        ],
      },
      {
        slug: "add_comment",
        name: "Commenter une issue",
        description: "Ajoute un commentaire (texte simple → ADF).",
        method: "POST",
        path: "/rest/api/3/issue/{issueKey}/comment",
        params: [
          { name: "issueKey", type: "string", description: "Clé de l'issue", required: true, in: "path" },
          { name: "body", type: "string", description: "Texte du commentaire", required: true, in: "body" },
        ],
        prepare: (params) => ({
          body: {
            type: "doc",
            version: 1,
            content: [
              { type: "paragraph", content: [{ type: "text", text: String(params.body ?? "") }] },
            ],
          },
        }),
      },
      {
        slug: "list_projects",
        name: "Projets accessibles",
        description: "Liste les projets visibles par l'utilisateur.",
        method: "GET",
        path: "/rest/api/3/project",
        params: [],
        maxOutputChars: 8000,
      },
    ],
  }
}
