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
    "billing.credits.title": "Achat de crédits à la carte",
    "billing.credits.desc": "Choisissez votre montant — 50 crédits minimum par achat, prix dégressif par paliers.",
    "billing.credits.amount": "Nombre de crédits",
    "billing.credits.amountPlaceholder": "Ex. 200",
    "billing.credits.min": "Minimum : {min} crédits",
    "billing.credits.unitPrice": "Prix unitaire : {price} FCFA / crédit",
    "billing.credits.total": "Total : {amount} FCFA pour {credits} crédits",
    "billing.credits.buy": "Acheter mes crédits",
    "billing.credits.invalid": "Montant invalide",
    "billing.credits.presets": "Montants rapides :",
    "billing.credits.tier": "{from} à {to} crédits : {price} FCFA / crédit",
    "billing.credits.tooLow": "Achat refusé : {min} crédits minimum par achat.",
    "billing.credits.purchased": "Achat de {credits} crédits initié — finalisez le paiement.",
    "billing.errors.creditsMin": "Le montant doit être d'au moins 50 crédits.",

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
    "billing.credits.title": "Flexible credit purchase",
    "billing.credits.desc": "Choose your amount — 50 credits minimum per purchase, volume-based tiered pricing.",
    "billing.credits.amount": "Number of credits",
    "billing.credits.amountPlaceholder": "E.g. 200",
    "billing.credits.min": "Minimum: {min} credits",
    "billing.credits.unitPrice": "Unit price: {price} FCFA / credit",
    "billing.credits.total": "Total: {amount} FCFA for {credits} credits",
    "billing.credits.buy": "Buy my credits",
    "billing.credits.invalid": "Invalid amount",
    "billing.credits.presets": "Quick amounts:",
    "billing.credits.tier": "{from} to {to} credits: {price} FCFA / credit",
    "billing.credits.tooLow": "Purchase refused: {min} credits minimum per purchase.",
    "billing.credits.purchased": "Purchase of {credits} credits initiated — complete the payment.",
    "billing.errors.creditsMin": "The amount must be at least 50 credits.",

    "billing.payments": "Chariow payments ({count})",
    "billing.pack": "{plan} pack",
    "billing.paymentMeta": "{amount} {currency} · {credits} credits · {date}",

    "billing.ledger.title": "Credit Ledger",
    "billing.ledger.empty": "No transactions yet.",
    "billing.ledger.meta": "{type} · {date} · balance {balance}",

    "billing.errors.checkout": "Payment failed",
  },
};
