/** Facturation — solde, recharges Chariow, paiements, journal des crédits. */

export const billing = {
  fr: {
    "billing.title": "Facturation",
    "billing.subtitle": "Rechargez vos crédits via Chariow. Chaque transaction est journalisée dans le ledger.",
    "billing.balance": "Solde actuel",
    "billing.balanceMeta": "crédits · plan {plan}",
    "billing.recentChanges": "Dernières variations",
    "billing.noTransactions": "Aucune transaction.",

    "billing.chariow.title": "Paiements Chariow non activés",
    "billing.chariow.desc": "La variable d'environnement {strong}CHARIOW_API_KEY{/strong} n'est pas configurée sur ce serveur. Ajoutez-la (ainsi que {strong}CHARIOW_WEBHOOK_SECRET{/strong}) pour activer les recharges. Voir {strong}.env.example{/strong}.",

    "billing.offers.title": "Recharges (FCFA)",
    "billing.creditsValue": "{credits} crédits",
    "billing.recharge": "Recharger",
    "billing.redirecting": "Redirection…",

    "billing.payments": "Paiements Chariow ({count})",
    "billing.pack": "Pack {plan}",
    "billing.paymentMeta": "{amount} {currency} · {credits} crédits · {date}",

    "billing.ledger.title": "Journal des crédits (Credit Ledger)",
    "billing.ledger.empty": "Aucune transaction pour l'instant.",
    "billing.ledger.meta": "{type} · {date} · solde {balance}",

    "billing.errors.checkout": "Paiement impossible",
  },
  en: {
    "billing.title": "Billing",
    "billing.subtitle": "Top up your credits via Chariow. Every transaction is recorded in the ledger.",
    "billing.balance": "Current balance",
    "billing.balanceMeta": "credits · {plan} plan",
    "billing.recentChanges": "Latest changes",
    "billing.noTransactions": "No transactions.",

    "billing.chariow.title": "Chariow payments not enabled",
    "billing.chariow.desc": "The {strong}CHARIOW_API_KEY{/strong} environment variable is not configured on this server. Add it (along with {strong}CHARIOW_WEBHOOK_SECRET{/strong}) to enable top-ups. See {strong}.env.example{/strong}.",

    "billing.offers.title": "Top-ups (FCFA)",
    "billing.creditsValue": "{credits} credits",
    "billing.recharge": "Top up",
    "billing.redirecting": "Redirecting…",

    "billing.payments": "Chariow payments ({count})",
    "billing.pack": "{plan} pack",
    "billing.paymentMeta": "{amount} {currency} · {credits} credits · {date}",

    "billing.ledger.title": "Credit Ledger",
    "billing.ledger.empty": "No transactions yet.",
    "billing.ledger.meta": "{type} · {date} · balance {balance}",

    "billing.errors.checkout": "Payment failed",
  },
};
