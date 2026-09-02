/**
 * Google — Gmail et Calendar (APIs v1/v3).
 * Auth : OAuth2 (client Google Cloud) ou compte de service
 * (JWT RS256 — géré par core/crypto.ts). L'envoi d'email exige
 * l'encodage RFC 2822 en base64url : le hook `prepare` s'en charge.
 */

import type { AppDefinition } from "../core/types"

/** Construit un message MIME RFC 2822 et l'encode en base64url (Gmail raw). */
function buildRawEmail(to: string, subject: string, body: string, cc?: string): string {
  const lines: string[] = [
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${Buffer.from(subject, "utf8").toString("binary").replace(/[^\x20-\x7E]/g, "?") === subject ? subject : `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ]
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url")
}

export function gmailApp(): AppDefinition {
  return {
    slug: "gmail",
    name: "Gmail",
    description: "Envoi, lecture et recherche d'emails Gmail (API v1).",
    category: "COMMUNICATION",
    logo: "📧",
    docsUrl: "https://developers.google.com/gmail/api/reference/rest",
    baseUrl: "https://gmail.googleapis.com/gmail/v1",
    authScheme: "OAUTH2",
    oauth2: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      scopes: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.modify"],
      extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
    },
    supportsTokenImport: false,
    actions: [
      {
        slug: "send_email",
        name: "Envoyer un email",
        description: "Envoie un email depuis le compte Gmail connecté.",
        method: "POST",
        path: "/users/me/messages/send",
        params: [
          { name: "to", type: "string", description: "Destinataire (email, plusieurs séparés par virgules)", required: true, in: "body" },
          { name: "subject", type: "string", description: "Objet de l'email", required: true, in: "body" },
          { name: "body", type: "string", description: "Corps texte de l'email", required: true, in: "body" },
          { name: "cc", type: "string", description: "Destinataires en copie", required: false, in: "body" },
        ],
        prepare: (params) => ({
          raw: buildRawEmail(
            String(params.to ?? ""),
            String(params.subject ?? ""),
            String(params.body ?? ""),
            params.cc ? String(params.cc) : undefined
          ),
        }),
      },
      {
        slug: "list_messages",
        name: "Lister les messages",
        description: "Liste les IDs et extraits des messages (défaut : boîte de réception).",
        method: "GET",
        path: "/users/me/messages",
        params: [
          { name: "q", type: "string", description: "Requête de recherche Gmail (ex: from:alice@x.com is:unread)", required: false, in: "query" },
          { name: "maxResults", type: "integer", description: "Nombre maximum (défaut 20)", required: false, in: "query", default: 20 },
        ],
        maxOutputChars: 5000,
      },
      {
        slug: "get_message",
        name: "Lire un message",
        description: "Récupère un message complet par son ID (headers, extrait du corps).",
        method: "GET",
        path: "/users/me/messages/{id}",
        params: [
          { name: "id", type: "string", description: "ID du message Gmail", required: true, in: "path" },
          { name: "format", type: "enum", description: "Format du rendu", required: false, in: "query", enum: ["full", "metadata", "raw"], default: "full" },
        ],
      },
      {
        slug: "get_profile",
        name: "Profil Gmail",
        description: "Adresse email et quota du compte connecté.",
        method: "GET",
        path: "/users/me/profile",
        params: [],
      },
    ],
  }
}

export function calendarApp(): AppDefinition {
  return {
    slug: "calendar",
    name: "Google Calendar",
    description: "Création et consultation d'événements Google Calendar (API v3).",
    category: "PRODUCTIVITY",
    logo: "📅",
    docsUrl: "https://developers.google.com/calendar/api/v3/reference",
    baseUrl: "https://www.googleapis.com/calendar/v3",
    authScheme: "OAUTH2",
    oauth2: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      scopes: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"],
      extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
    },
    supportsTokenImport: false,
    actions: [
      {
        slug: "create_event",
        name: "Créer un événement",
        description: "Crée un événement dans un agenda (start/end en RFC 3339).",
        method: "POST",
        path: "/calendars/{calendarId}/events",
        params: [
          { name: "calendarId", type: "string", description: "ID de l'agenda (« primary » pour le principal)", required: true, in: "path", default: "primary" },
          { name: "summary", type: "string", description: "Titre de l'événement", required: true, in: "body" },
          { name: "start", type: "string", description: "Début (RFC 3339, ex: 2026-01-15T10:00:00Z)", required: true, in: "body" },
          { name: "end", type: "string", description: "Fin (RFC 3339)", required: true, in: "body" },
          { name: "description", type: "string", description: "Description", required: false, in: "body" },
          { name: "attendees", type: "array", description: "Invités JSON, ex: [{\"email\":\"a@x.com\"}]", required: false, in: "body" },
        ],
        prepare: (params) => ({
          calendarId: params.calendarId ?? "primary",
          summary: params.summary,
          description: params.description,
          start: { dateTime: params.start },
          end: { dateTime: params.end },
          ...(Array.isArray(params.attendees) ? { attendees: params.attendees } : {}),
        }),
      },
      {
        slug: "list_events",
        name: "Événements à venir",
        description: "Liste les événements d'un agenda (fenêtre temporelle).",
        method: "GET",
        path: "/calendars/{calendarId}/events",
        params: [
          { name: "calendarId", type: "string", description: "ID de l'agenda (« primary »)", required: true, in: "path", default: "primary" },
          { name: "timeMin", type: "string", description: "Borne inférieure (RFC 3339)", required: false, in: "query" },
          { name: "timeMax", type: "string", description: "Borne supérieure (RFC 3339)", required: false, in: "query" },
          { name: "maxResults", type: "integer", description: "Nombre maximum", required: false, in: "query", default: 25 },
        ],
        maxOutputChars: 8000,
      },
      {
        slug: "delete_event",
        name: "Supprimer un événement",
        description: "Supprime un événement par son ID.",
        method: "DELETE",
        path: "/calendars/{calendarId}/events/{eventId}",
        params: [
          { name: "calendarId", type: "string", description: "ID de l'agenda", required: true, in: "path", default: "primary" },
          { name: "eventId", type: "string", description: "ID de l'événement", required: true, in: "path" },
        ],
      },
      {
        slug: "list_calendars",
        name: "Mes agendas",
        description: "Liste tous les agendas du compte.",
        method: "GET",
        path: "/users/me/calendarList",
        params: [],
      },
    ],
  }
}
