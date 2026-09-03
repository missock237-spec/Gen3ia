/**
 * Linear — API GraphQL (https://developers.linear.app).
 * Auth : personal API key (header Authorization direct, sans Bearer).
 * Le hook `prepare` construit les documents GraphQL depuis des
 * arguments structurés — le LLM ne manipule jamais de GraphQL brut.
 */

import type { AppDefinition } from "../core/types"

export function linearApp(): AppDefinition {
  return {
    slug: "linear",
    name: "Linear",
    description: "Issues et équipes Linear (API GraphQL).",
    category: "DEVELOPMENT",
    logo: "📐",
    docsUrl: "https://developers.linear.app",
    baseUrl: "https://api.linear.app",
    authScheme: "BEARER_TOKEN",
    supportsTokenImport: true,
    apiKeyEnv: { envVars: ["LINEAR_API_KEY", "LINEAR_TOKEN"], label: "Personal API key (lin_api_… / lin_wsk_…)" },
    tokenImportAuth: { style: "header", name: "Authorization", template: "{{token}}" },
    actions: [
      {
        slug: "list_teams",
        name: "Lister les équipes",
        description: "Récupère les équipes avec leurs projets.",
        method: "POST",
        path: "/graphql",
        params: [],
        prepare: () => ({
          query: `query Teams { teams { nodes { id name key } } }`,
        }),
        maxOutputChars: 4000,
      },
      {
        slug: "list_issues",
        name: "Lister les issues",
        description: "Issues récentes, filtrables par équipe et état.",
        method: "POST",
        path: "/graphql",
        params: [
          { name: "teamKey", type: "string", description: "Clé d'équipe (ex: GEN) — optionnel", required: false, in: "body" },
          { name: "first", type: "integer", description: "Nombre d'issues (défaut 25)", required: false, in: "body", default: 25 },
        ],
        prepare: (params) => {
          const first = Number(params.first ?? 25)
          const filter = params.teamKey
            ? `, filter: { team: { key: { eq: "${String(params.teamKey).toUpperCase()}" } } }`
            : ""
          return {
            query: `query Issues { issues(first: ${first}, orderBy: updatedAt${filter}) { nodes { identifier title url priority { name } state { name } assignee { name } } } }`,
          }
        },
        maxOutputChars: 8000,
      },
      {
        slug: "create_issue",
        name: "Créer une issue",
        description: "Crée une issue Linear (équipe + titre obligatoires).",
        method: "POST",
        path: "/graphql",
        params: [
          { name: "teamId", type: "string", description: "ID de l'équipe (utiliser list_teams)", required: true, in: "body" },
          { name: "title", type: "string", description: "Titre de l'issue", required: true, in: "body" },
          { name: "description", type: "string", description: "Description (Markdown)", required: false, in: "body" },
          { name: "priority", type: "integer", description: "0=urgent 1=high 2=medium 3=low 0…", required: false, in: "body" },
        ],
        prepare: (params) => {
          const input: Record<string, unknown> = {
            teamId: String(params.teamId ?? ""),
            title: String(params.title ?? ""),
          }
          if (params.description) input.description = String(params.description)
          if (params.priority !== undefined && params.priority !== null) input.priority = Number(params.priority)
          return {
            query: `mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }`,
            variables: { input },
          }
        },
      },
      {
        slug: "update_issue",
        name: "Mettre à jour une issue",
        description: "Modifie titre / description / état d'une issue.",
        method: "POST",
        path: "/graphql",
        params: [
          { name: "issueId", type: "string", description: "ID de l'issue (Linear)", required: true, in: "body" },
          { name: "title", type: "string", description: "Nouveau titre", required: false, in: "body" },
          { name: "description", type: "string", description: "Nouvelle description", required: false, in: "body" },
          { name: "stateId", type: "string", description: "ID de l'état cible", required: false, in: "body" },
        ],
        prepare: (params) => {
          const input: Record<string, unknown> = {}
          for (const key of ["title", "description", "stateId"] as const) {
            if (params[key]) input[key] = String(params[key])
          }
          return {
            query: `mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier } } }`,
            variables: { id: String(params.issueId ?? ""), input },
          }
        },
      },
    ],
  }
}

/**
 * Airtable — API v0. PAT (Bearer) + metadata API.
 */
export function airtableApp(): AppDefinition {
  return {
    slug: "airtable",
    name: "Airtable",
    description: "Bases, tables et enregistrements Airtable (API v0).",
    category: "DATA",
    logo: "🗂️",
    docsUrl: "https://support.airtable.com/docs/api-version-0-50-changes",
    baseUrl: "https://api.airtable.com/v0",
    authScheme: "BEARER_TOKEN",
    supportsTokenImport: true,
    apiKeyEnv: { envVars: ["AIRTABLE_API_KEY", "AIRTABLE_TOKEN"], label: "Personal access token (pat…)" },
    tokenImportAuth: { style: "bearer" },
    actions: [
      {
        slug: "list_bases",
        name: "Mes bases",
        description: "Liste les bases accessibles (metadata API).",
        method: "GET",
        path: "/meta/bases",
        params: [],
      },
      {
        slug: "list_tables",
        name: "Tables d'une base",
        description: "Liste les tables et schémas d'une base.",
        method: "GET",
        path: "/meta/bases/{baseId}/tables",
        params: [
          { name: "baseId", type: "string", description: "ID de la base (app…)", required: true, in: "path" },
        ],
        maxOutputChars: 8000,
      },
      {
        slug: "list_records",
        name: "Lire des enregistrements",
        description: "Lit les enregistrements d'une table (filtre optionnel).",
        method: "GET",
        path: "/{baseId}/{tableId}",
        params: [
          { name: "baseId", type: "string", description: "ID de la base", required: true, in: "path" },
          { name: "tableId", type: "string", description: "Nom ou ID de la table", required: true, in: "path" },
          { name: "maxRecords", type: "integer", description: "Nombre max d'enregistrements", required: false, in: "query", default: 30 },
          { name: "filterByFormula", type: "string", description: "Formule Airtable (ex: {Status}='Open')", required: false, in: "query" },
        ],
        maxOutputChars: 9000,
      },
      {
        slug: "create_record",
        name: "Créer un enregistrement",
        description: "Ajoute une ligne dans une table (fields en JSON).",
        method: "POST",
        path: "/{baseId}/{tableId}",
        params: [
          { name: "baseId", type: "string", description: "ID de la base", required: true, in: "path" },
          { name: "tableId", type: "string", description: "Nom ou ID de la table", required: true, in: "path" },
          { name: "fields", type: "object", description: "Champs JSON, ex: {\"Name\":\"Alice\",\"Status\":\"Open\"}", required: true, in: "body" },
        ],
        prepare: (params) => ({ fields: params.fields ?? {} }),
      },
      {
        slug: "update_record",
        name: "Mettre à jour un enregistrement",
        description: "Modifie les champs d'un enregistrement.",
        method: "PATCH",
        path: "/{baseId}/{tableId}/{recordId}",
        params: [
          { name: "baseId", type: "string", description: "ID de la base", required: true, in: "path" },
          { name: "tableId", type: "string", description: "Nom ou ID de la table", required: true, in: "path" },
          { name: "recordId", type: "string", description: "ID de l'enregistrement (rec…)", required: true, in: "path" },
          { name: "fields", type: "object", description: "Champs modifiés (JSON)", required: true, in: "body" },
        ],
        prepare: (params) => ({ fields: params.fields ?? {} }),
      },
      {
        slug: "delete_record",
        name: "Supprimer un enregistrement",
        description: "Supprime une ligne d'une table.",
        method: "DELETE",
        path: "/{baseId}/{tableId}/{recordId}",
        params: [
          { name: "baseId", type: "string", description: "ID de la base", required: true, in: "path" },
          { name: "tableId", type: "string", description: "Nom ou ID de la table", required: true, in: "path" },
          { name: "recordId", type: "string", description: "ID de l'enregistrement", required: true, in: "path" },
        ],
      },
    ],
  }
}
