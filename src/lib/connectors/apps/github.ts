/**
 * GitHub — API REST v3 (https://docs.github.com/rest).
 * Auth : OAuth2 (GitHub Apps / OAuth Apps) ou import de Personal
 * Access Token (fine-grained / classic). Aucune action simulée :
 * chaque action correspond à un endpoint documenté.
 */

import type { AppDefinition } from "../core/types"

export function githubApp(): AppDefinition {
  return {
    slug: "github",
    name: "GitHub",
    description:
      "Dépôts, issues, pull requests, fichiers et recherche sur GitHub (API REST v3).",
    category: "DEVELOPMENT",
    logo: "🐙",
    docsUrl: "https://docs.github.com/rest",
    baseUrl: "https://api.github.com",
    authScheme: "OAUTH2",
    oauth2: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: ["repo", "read:user", "user:email", "workflow"],
      extraTokenParams: {},
    },
    supportsTokenImport: true,
    apiKeyEnv: { envVars: ["GITHUB_API_KEY", "GITHUB_TOKEN"], label: "Personal Access Token (ghp_… / github_pat_…)" },
    tokenImportAuth: { style: "bearer" },
    actions: [
      {
        slug: "get_me",
        name: "Mon profil GitHub",
        description: "Récupère l'utilisateur authentifié (login, nom, email public).",
        method: "GET",
        path: "/user",
        params: [],
      },
      {
        slug: "create_repository",
        name: "Créer un dépôt",
        description: "Crée un nouveau dépôt pour l'utilisateur authentifié.",
        method: "POST",
        path: "/user/repos",
        params: [
          { name: "name", type: "string", description: "Nom du dépôt", required: true, in: "body" },
          { name: "description", type: "string", description: "Description du dépôt", required: false, in: "body" },
          { name: "private", type: "boolean", description: "Dépôt privé (défaut false)", required: false, in: "body", default: false },
          { name: "auto_init", type: "boolean", description: "Initialiser avec un README", required: false, in: "body", default: true },
        ],
      },
      {
        slug: "get_repository",
        name: "Détails d'un dépôt",
        description: "Récupère les métadonnées d'un dépôt (langage, étoiles, branche par défaut…).",
        method: "GET",
        path: "/repos/{owner}/{repo}",
        params: [
          { name: "owner", type: "string", description: "Propriétaire du dépôt", required: true, in: "path" },
          { name: "repo", type: "string", description: "Nom du dépôt", required: true, in: "path" },
        ],
      },
      {
        slug: "list_repositories",
        name: "Mes dépôts",
        description: "Liste les dépôts accessibles à l'utilisateur authentifié.",
        method: "GET",
        path: "/user/repos",
        params: [
          { name: "visibility", type: "enum", description: "Filtre de visibilité", required: false, in: "query", enum: ["all", "public", "private"], default: "all" },
          { name: "per_page", type: "integer", description: "Résultats par page (max 100)", required: false, in: "query", default: 30 },
        ],
      },
      {
        slug: "create_issue",
        name: "Créer une issue",
        description: "Ouvre une issue sur un dépôt GitHub.",
        method: "POST",
        path: "/repos/{owner}/{repo}/issues",
        params: [
          { name: "owner", type: "string", description: "Propriétaire du dépôt", required: true, in: "path" },
          { name: "repo", type: "string", description: "Nom du dépôt", required: true, in: "path" },
          { name: "title", type: "string", description: "Titre de l'issue", required: true, in: "body" },
          { name: "body", type: "string", description: "Description (Markdown)", required: false, in: "body" },
          { name: "labels", type: "array", description: "Labels JSON, ex: [\"bug\",\"urgent\"]", required: false, in: "body" },
        ],
      },
      {
        slug: "list_issues",
        name: "Lister les issues",
        description: "Liste les issues d'un dépôt (filtrable par état et auteur).",
        method: "GET",
        path: "/repos/{owner}/{repo}/issues",
        params: [
          { name: "owner", type: "string", description: "Propriétaire du dépôt", required: true, in: "path" },
          { name: "repo", type: "string", description: "Nom du dépôt", required: true, in: "path" },
          { name: "state", type: "enum", description: "État des issues", required: false, in: "query", enum: ["open", "closed", "all"], default: "open" },
          { name: "per_page", type: "integer", description: "Résultats par page", required: false, in: "query", default: 30 },
        ],
      },
      {
        slug: "get_issue",
        name: "Détail d'une issue",
        description: "Récupère une issue (corps, labels, assignés).",
        method: "GET",
        path: "/repos/{owner}/{repo}/issues/{issue_number}",
        params: [
          { name: "owner", type: "string", description: "Propriétaire du dépôt", required: true, in: "path" },
          { name: "repo", type: "string", description: "Nom du dépôt", required: true, in: "path" },
          { name: "issue_number", type: "integer", description: "Numéro de l'issue", required: true, in: "path" },
        ],
      },
      {
        slug: "add_issue_comment",
        name: "Commenter une issue",
        description: "Ajoute un commentaire sur une issue ou pull request.",
        method: "POST",
        path: "/repos/{owner}/{repo}/issues/{issue_number}/comments",
        params: [
          { name: "owner", type: "string", description: "Propriétaire du dépôt", required: true, in: "path" },
          { name: "repo", type: "string", description: "Nom du dépôt", required: true, in: "path" },
          { name: "issue_number", type: "integer", description: "Numéro de l'issue/PR", required: true, in: "path" },
          { name: "body", type: "string", description: "Texte du commentaire (Markdown)", required: true, in: "body" },
        ],
      },
      {
        slug: "create_pull_request",
        name: "Créer une pull request",
        description: "Ouvre une PR d'une branche vers une autre.",
        method: "POST",
        path: "/repos/{owner}/{repo}/pulls",
        params: [
          { name: "owner", type: "string", description: "Propriétaire du dépôt", required: true, in: "path" },
          { name: "repo", type: "string", description: "Nom du dépôt", required: true, in: "path" },
          { name: "title", type: "string", description: "Titre de la PR", required: true, in: "body" },
          { name: "head", type: "string", description: "Branche source (ex: feature-x)", required: true, in: "body" },
          { name: "base", type: "string", description: "Branche cible (ex: main)", required: true, in: "body" },
          { name: "body", type: "string", description: "Description de la PR", required: false, in: "body" },
        ],
      },
      {
        slug: "list_pull_requests",
        name: "Lister les pull requests",
        description: "Liste les PR d'un dépôt.",
        method: "GET",
        path: "/repos/{owner}/{repo}/pulls",
        params: [
          { name: "owner", type: "string", description: "Propriétaire du dépôt", required: true, in: "path" },
          { name: "repo", type: "string", description: "Nom du dépôt", required: true, in: "path" },
          { name: "state", type: "enum", description: "État des PR", required: false, in: "query", enum: ["open", "closed", "all"], default: "open" },
        ],
      },
      {
        slug: "merge_pull_request",
        name: "Fusionner une pull request",
        description: "Fusionne une PR (merge, squash ou rebase).",
        method: "PUT",
        path: "/repos/{owner}/{repo}/pulls/{pull_number}/merge",
        params: [
          { name: "owner", type: "string", description: "Propriétaire du dépôt", required: true, in: "path" },
          { name: "repo", type: "string", description: "Nom du dépôt", required: true, in: "path" },
          { name: "pull_number", type: "integer", description: "Numéro de la PR", required: true, in: "path" },
          { name: "merge_method", type: "enum", description: "Méthode de fusion", required: false, in: "body", enum: ["merge", "squash", "rebase"], default: "merge" },
        ],
      },
      {
        slug: "create_file",
        name: "Créer/modifier un fichier",
        description: "Committe un fichier (contenu encodé automatiquement en base64).",
        method: "PUT",
        path: "/repos/{owner}/{repo}/contents/{path}",
        params: [
          { name: "owner", type: "string", description: "Propriétaire du dépôt", required: true, in: "path" },
          { name: "repo", type: "string", description: "Nom du dépôt", required: true, in: "path" },
          { name: "path", type: "string", description: "Chemin du fichier dans le dépôt", required: true, in: "path" },
          { name: "message", type: "string", description: "Message du commit", required: true, in: "body" },
          { name: "content", type: "string", description: "Contenu texte du fichier (encodé en base64 automatiquement)", required: true, in: "body" },
          { name: "branch", type: "string", description: "Branche cible", required: false, in: "body" },
        ],
        prepare: (params) => ({
          ...params,
          content: Buffer.from(String(params.content ?? ""), "utf8").toString("base64"),
        }),
      },
      {
        slug: "get_file",
        name: "Lire un fichier",
        description: "Récupère le contenu et les métadonnées d'un fichier du dépôt.",
        method: "GET",
        path: "/repos/{owner}/{repo}/contents/{path}",
        params: [
          { name: "owner", type: "string", description: "Propriétaire du dépôt", required: true, in: "path" },
          { name: "repo", type: "string", description: "Nom du dépôt", required: true, in: "path" },
          { name: "path", type: "string", description: "Chemin du fichier", required: true, in: "path" },
          { name: "ref", type: "string", description: "Branche ou tag", required: false, in: "query" },
        ],
      },
      {
        slug: "search_repositories",
        name: "Rechercher des dépôts",
        description: "Recherche full-text de dépôts publics.",
        method: "GET",
        path: "/search/repositories",
        params: [
          { name: "q", type: "string", description: "Requête de recherche (syntaxe GitHub)", required: true, in: "query" },
          { name: "per_page", type: "integer", description: "Résultats par page", required: false, in: "query", default: 10 },
        ],
        maxOutputChars: 8000,
      },
    ],
  }
}
