/**
 * Telegram Bot API + Stripe + X (Twitter) API v2.
 * Telegram : token injecté dans le chemin (/bot<token>/method).
 * Stripe : secret key (Bearer, corps form-encodés).
 * X : OAuth2 PKCE (scopes tweet.read/tweet.write/users.read).
 */

import type { AppDefinition } from "../core/types"

export function telegramApp(): AppDefinition {
  return {
    slug: "telegram",
    name: "Telegram",
    description: "Bot Telegram : envoi de messages et lecture des updates (Bot API).",
    category: "COMMUNICATION",
    logo: "✈️",
    docsUrl: "https://core.telegram.org/bots/api",
    baseUrl: "https://api.telegram.org",
    authScheme: "API_KEY",
    supportsTokenImport: true,
    apiKeyEnv: { envVars: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_API_KEY"], label: "Bot token (123456:ABC-DEF…)" },
    tokenImportAuth: { style: "pathPrefix", template: "/bot{{token}}" },
    actions: [
      {
        slug: "get_me",
        name: "Identité du bot",
        description: "Vérifie le bot (username, id).",
        method: "GET",
        path: "getMe",
        auth: { style: "pathPrefix", template: "/bot{{token}}" },
        params: [],
      },
      {
        slug: "send_message",
        name: "Envoyer un message",
        description: "Envoie un texte à un chat (ID numérique ou @canal).",
        method: "POST",
        path: "sendMessage",
        auth: { style: "pathPrefix", template: "/bot{{token}}" },
        params: [
          { name: "chat_id", type: "string", description: "ID du chat ou @username du canal", required: true, in: "body" },
          { name: "text", type: "string", description: "Texte du message (Markdown supporté selon mode)", required: true, in: "body" },
          { name: "parse_mode", type: "enum", description: "Formatage", required: false, in: "body", enum: ["Markdown", "HTML", "None"], default: "None" },
        ],
        prepare: (params) => {
          const out: Record<string, unknown> = {
            chat_id: params.chat_id,
            text: params.text,
          }
          if (params.parse_mode && params.parse_mode !== "None") {
            out.parse_mode = String(params.parse_mode)
          }
          return out
        },
      },
      {
        slug: "get_updates",
        name: "Messages reçus",
        description: "Récupère les derniers messages reçus par le bot (polling).",
        method: "GET",
        path: "getUpdates",
        auth: { style: "pathPrefix", template: "/bot{{token}}" },
        params: [
          { name: "limit", type: "integer", description: "Nombre d'updates (max 100)", required: false, in: "query", default: 20 },
        ],
        maxOutputChars: 8000,
      },
      {
        slug: "send_location",
        name: "Envoyer une position",
        description: "Envoie des coordonnées géographiques à un chat.",
        method: "POST",
        path: "sendLocation",
        auth: { style: "pathPrefix", template: "/bot{{token}}" },
        params: [
          { name: "chat_id", type: "string", description: "ID du chat", required: true, in: "body" },
          { name: "latitude", type: "number", description: "Latitude (-90…90)", required: true, in: "body" },
          { name: "longitude", type: "number", description: "Longitude (-180…180)", required: true, in: "body" },
        ],
      },
    ],
  }
}

export function stripeApp(): AppDefinition {
  return {
    slug: "stripe",
    name: "Stripe",
    description: "Clients, factures et paiements Stripe (corps form-encodés).",
    category: "PAYMENTS",
    logo: "💳",
    docsUrl: "https://docs.stripe.com/api",
    baseUrl: "https://api.stripe.com/v1",
    authScheme: "BEARER_TOKEN",
    supportsTokenImport: true,
    apiKeyEnv: { envVars: ["STRIPE_SECRET_KEY"], label: "Secret key (sk_live_… / sk_test_…)" },
    tokenImportAuth: { style: "bearer" },
    actions: [
      {
        slug: "get_balance",
        name: "Solde du compte",
        description: "Solde disponible et en attente.",
        method: "GET",
        path: "/balance",
        params: [],
      },
      {
        slug: "create_customer",
        name: "Créer un client",
        description: "Crée un client Stripe (nom, email).",
        method: "POST",
        path: "/customers",
        bodyContentType: "form",
        params: [
          { name: "name", type: "string", description: "Nom du client", required: true, in: "body" },
          { name: "email", type: "string", description: "Email du client", required: false, in: "body" },
          { name: "description", type: "string", description: "Description", required: false, in: "body" },
        ],
      },
      {
        slug: "list_customers",
        name: "Lister les clients",
        description: "Derniers clients du compte.",
        method: "GET",
        path: "/customers",
        params: [
          { name: "limit", type: "integer", description: "Nombre (max 100)", required: false, in: "query", default: 20 },
        ],
        maxOutputChars: 7000,
      },
      {
        slug: "create_invoice",
        name: "Créer une facture",
        description: "Crée une facture brouillon pour un client.",
        method: "POST",
        path: "/invoices",
        bodyContentType: "form",
        params: [
          { name: "customer", type: "string", description: "ID du client (cus_…)", required: true, in: "body" },
          { name: "description", type: "string", description: "Description de la facture", required: false, in: "body" },
        ],
      },
      {
        slug: "list_invoices",
        name: "Lister les factures",
        description: "Factures récentes du compte.",
        method: "GET",
        path: "/invoices",
        params: [
          { name: "limit", type: "integer", description: "Nombre (max 100)", required: false, in: "query", default: 20 },
        ],
        maxOutputChars: 7000,
      },
      {
        slug: "create_payment_intent",
        name: "Intention de paiement",
        description: "Crée un PaymentIntent (montant en centimes).",
        method: "POST",
        path: "/payment_intents",
        bodyContentType: "form",
        params: [
          { name: "amount", type: "integer", description: "Montant en unités minimales (centimes)", required: true, in: "body" },
          { name: "currency", type: "string", description: "Code devise ISO (ex: eur, usd)", required: true, in: "body" },
          { name: "customer", type: "string", description: "ID client (optionnel)", required: false, in: "body" },
          { name: "description", type: "string", description: "Description", required: false, in: "body" },
        ],
      },
      {
        slug: "list_charges",
        name: "Transactions",
        description: "Derniers paiements du compte.",
        method: "GET",
        path: "/charges",
        params: [
          { name: "limit", type: "integer", description: "Nombre (max 100)", required: false, in: "query", default: 20 },
        ],
        maxOutputChars: 7000,
      },
    ],
  }
}

export function twitterApp(): AppDefinition {
  return {
    slug: "twitter",
    name: "X (Twitter)",
    description: "Publication et recherche de posts sur X (API v2, OAuth2 PKCE).",
    category: "SOCIAL",
    logo: "𝕏",
    docsUrl: "https://docs.x.com/x-api",
    baseUrl: "https://api.x.com/2",
    authScheme: "OAUTH2",
    oauth2: {
      clientId: process.env.X_CLIENT_ID ?? "",
      clientSecret: process.env.X_CLIENT_SECRET ?? "",
      authorizeUrl: "https://x.com/i/oauth2/authorize",
      tokenUrl: "https://api.x.com/2/oauth2/token",
      revokeUrl: "https://api.x.com/2/oauth2/revoke",
      scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
      usePkce: true,
      extraAuthorizeParams: {},
    },
    supportsTokenImport: false,
    actions: [
      {
        slug: "get_me",
        name: "Mon profil X",
        description: "Identité du compte connecté.",
        method: "GET",
        path: "/users/me",
        params: [
          { name: "user.fields", type: "string", description: "Champs additionnels", required: false, in: "query", default: "public_metrics" },
        ],
      },
      {
        slug: "create_tweet",
        name: "Publier un post",
        description: "Publie un post (280 caractères).",
        method: "POST",
        path: "/tweets",
        params: [
          { name: "text", type: "string", description: "Contenu du post (max 280)", required: true, in: "body" },
        ],
        prepare: (params) => ({ text: String(params.text ?? "").slice(0, 280) }),
      },
      {
        slug: "search_recent",
        name: "Recherche récente",
        description: "Recherche des posts récents (requête standard).",
        method: "GET",
        path: "/tweets/search/recent",
        params: [
          { name: "query", type: "string", description: "Requête de recherche (syntaxe X)", required: true, in: "query" },
          { name: "max_results", type: "integer", description: "Nombre (10-100)", required: false, in: "query", default: 10 },
        ],
        maxOutputChars: 8000,
      },
      {
        slug: "delete_tweet",
        name: "Supprimer un post",
        description: "Supprime un post par son ID.",
        method: "DELETE",
        path: "/tweets/{id}",
        params: [
          { name: "id", type: "string", description: "ID du post", required: true, in: "path" },
        ],
      },
    ],
  }
}
