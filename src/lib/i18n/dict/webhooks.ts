/** Webhooks sortants — notifications HTTP signées (HMAC) des événements. */

export const webhooks = {
  fr: {
    "webhooks.title": "Webhooks sortants",
    "webhooks.subtitle":
      "Recevez les événements GEN3IA sur vos systèmes : chaque livraison est signée (HMAC) et journalisée avec son code HTTP de réponse.",
    "webhooks.create": "Créer un webhook",
    "webhooks.url": "URL de destination",
    "webhooks.events": "Événements",
    "webhooks.empty": "Aucun webhook. Créez-en un pour être notifié automatiquement.",
    "webhooks.active": "Actif",
    "webhooks.suspended": "Suspendu",
    "webhooks.suspend": "Suspendre",
    "webhooks.resume": "Réactiver",
    "webhooks.deliveries": "Dernières livraisons",
    "webhooks.signatureHint":
      "Vérifiez la signature {strong}X-GEN3IA-Signature{/strong} (HMAC-SHA256 du corps brut avec le secret fourni à la création) côté destinataire pour rejeter toute requête falsifiée.",
    "webhooks.errors.invalidUrl": "URL invalide",
    "webhooks.errors.invalidUrlDesc": "L'URL du webhook doit commencer par http(s)://.",
    "webhooks.errors.noEvents": "Aucun événement",
    "webhooks.errors.noEventsDesc": "Sélectionnez au moins un événement.",
    "webhooks.created.title": "Webhook créé",
    "webhooks.created.desc": "Secret de signature affiché une seule fois — copiez-le maintenant.",
    "webhooks.errors.createFailed": "Création refusée",
    "webhooks.deleted": "Webhook supprimé",
  },
  en: {
    "webhooks.title": "Outgoing webhooks",
    "webhooks.subtitle":
      "Receive GEN3IA events on your systems: every delivery is signed (HMAC) and logged with its HTTP response code.",
    "webhooks.create": "Create a webhook",
    "webhooks.url": "Destination URL",
    "webhooks.events": "Events",
    "webhooks.empty": "No webhooks yet. Create one to get notified automatically.",
    "webhooks.active": "Active",
    "webhooks.suspended": "Suspended",
    "webhooks.suspend": "Suspend",
    "webhooks.resume": "Resume",
    "webhooks.deliveries": "Recent deliveries",
    "webhooks.signatureHint":
      "Verify the {strong}X-GEN3IA-Signature{/strong} signature (HMAC-SHA256 of the raw body with the secret provided at creation) on the recipient side to reject any forged request.",
    "webhooks.errors.invalidUrl": "Invalid URL",
    "webhooks.errors.invalidUrlDesc": "The webhook URL must start with http(s)://.",
    "webhooks.errors.noEvents": "No events",
    "webhooks.errors.noEventsDesc": "Select at least one event.",
    "webhooks.created.title": "Webhook created",
    "webhooks.created.desc": "Signing secret shown only once — copy it now.",
    "webhooks.errors.createFailed": "Creation failed",
    "webhooks.deleted": "Webhook deleted",
  },
};
