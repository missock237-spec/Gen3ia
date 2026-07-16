/**
 * i18n — Internationalisation de Genova
 * Support : Français (fr), Anglais (en)
 */

export type Locale = 'fr' | 'en';

export const LOCALES: Locale[] = ['fr', 'en'];

const DEFAULT_LOCALE: Locale = 'fr';

const translations: Record<Locale, Record<string, string>> = {
  fr: {
    'app.name': 'Genova AI',
    'app.tagline': 'Système d\'exploitation pour agents IA',
    'app.description': 'Créez, gérez et orchestrez vos agents AI',
    'nav.dashboard': 'Tableau de bord',
    'nav.agents': 'Agents',
    'nav.marketplace': 'Marketplace',
    'nav.billing': 'Facturation',
    'nav.settings': 'Paramètres',
    'nav.apiKeys': 'Clés API',
    'nav.connectors': 'Connecteurs',
    'agent.create': 'Créer un agent',
    'agent.edit': 'Modifier',
    'agent.delete': 'Supprimer',
    'agent.run': 'Exécuter',
    'agent.status.active': 'Actif',
    'agent.status.inactive': 'Inactif',
    'billing.plans': 'Nos offres',
    'billing.free': 'Gratuit',
    'billing.month': '/mois',
    'billing.upgrade': 'Passer à',
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.search': 'Rechercher',
    'common.loading': 'Chargement...',
    'common.error': 'Erreur',
    'common.success': 'Succès',
    'auth.login': 'Connexion',
    'auth.register': 'Inscription',
    'auth.logout': 'Déconnexion',
    'auth.email': 'Email',
    'auth.password': 'Mot de passe',
    'marketplace.browse': 'Parcourir',
    'marketplace.sell': 'Vendre',
    'marketplace.buy': 'Acheter',
    'marketplace.free': 'Gratuit',
    'credits.balance': 'Solde',
    'credits.earn': 'Gagner des crédits',
    'terminal.title': 'Terminal',
    'terminal.run': 'Exécuter',
  },
  en: {
    'app.name': 'Genova AI',
    'app.tagline': 'AI Agent Operating System',
    'app.description': 'Create, manage and orchestrate your AI agents',
    'nav.dashboard': 'Dashboard',
    'nav.agents': 'Agents',
    'nav.marketplace': 'Marketplace',
    'nav.billing': 'Billing',
    'nav.settings': 'Settings',
    'nav.apiKeys': 'API Keys',
    'nav.connectors': 'Connectors',
    'agent.create': 'Create agent',
    'agent.edit': 'Edit',
    'agent.delete': 'Delete',
    'agent.run': 'Run',
    'agent.status.active': 'Active',
    'agent.status.inactive': 'Inactive',
    'billing.plans': 'Plans',
    'billing.free': 'Free',
    'billing.month': '/month',
    'billing.upgrade': 'Upgrade to',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.search': 'Search',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'auth.login': 'Login',
    'auth.register': 'Register',
    'auth.logout': 'Logout',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'marketplace.browse': 'Browse',
    'marketplace.sell': 'Sell',
    'marketplace.buy': 'Buy',
    'marketplace.free': 'Free',
    'credits.balance': 'Balance',
    'credits.earn': 'Earn credits',
    'terminal.title': 'Terminal',
    'terminal.run': 'Run',
  },
};

export function getTranslations(locale?: string): Record<string, string> {
  const l = (locale === 'en' ? 'en' : 'fr') as Locale;
  return { ...translations['fr'], ...translations[l] };
}

export function getDefaultLocale(): Locale {
  return DEFAULT_LOCALE;
}

export function detectLocale(acceptLanguage?: string): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  if (acceptLanguage.includes('fr')) return 'fr';
  if (acceptLanguage.includes('en')) return 'en';
  return DEFAULT_LOCALE;
}

export function t(key: string, locale?: string): string {
  const l = (locale === 'en' ? 'en' : 'fr') as Locale;
  return translations[l][key] || translations[DEFAULT_LOCALE][key] || key;
}
