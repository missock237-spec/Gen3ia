import { createTranslator } from 'next-intl';

export type Locale = 'fr' | 'en' | 'pt';

export const LOCALES: Locale[] = ['fr', 'en', 'pt'];
export const DEFAULT_LOCALE: Locale = 'fr';

export const LOCALE_NAMES: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  pt: 'Português',
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
  pt: '🇵🇹',
};

export const LOCALE_MARKETS: Record<Locale, string[]> = {
  fr: ['Cameroun', 'Côte d\'Ivoire', 'Sénégal', 'RDC', 'Mali', 'Burkina Faso', 'France', 'Belgique', 'Suisse'],
  en: ['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Uganda', 'Tanzania', 'UK', 'USA'],
  pt: ['Angola', 'Mozambique', 'Portugal', 'Brésil'],
};

export function getLocaleFromPath(path: string): Locale {
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 0 && LOCALES.includes(segments[0] as Locale)) {
    return segments[0] as Locale;
  }
  return DEFAULT_LOCALE;
}

export function getPathWithoutLocale(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 0 && LOCALES.includes(segments[0] as Locale)) {
    return '/' + segments.slice(1).join('/');
  }
  return path;
}

export function getLocalizedPath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path;
  const cleanPath = getPathWithoutLocale(path);
  return `/${locale}${cleanPath === '/' ? '' : cleanPath}`;
}

export const messages = {
  fr: {
    nav: {
      dashboard: 'Tableau de bord',
      agents: 'Agents',
      billing: 'Facturation',
      settings: 'Paramètres',
      admin: 'Administration',
    },
    auth: {
      login: 'Connexion',
      register: 'Inscription',
      logout: 'Déconnexion',
      email: 'Email',
      password: 'Mot de passe',
      forgotPassword: 'Mot de passe oublié ?',
      noAccount: 'Pas encore de compte ?',
      hasAccount: 'Déjà un compte ?',
    },
    agents: {
      create: 'Créer un agent',
      myAgents: 'Mes agents',
      noAgents: 'Aucun agent pour le moment',
      chat: 'Discussion',
      configure: 'Configuration',
    },
    billing: {
      plans: 'Forfaits',
      current: 'Forfait actuel',
      upgrade: 'Passer à',
      credits: 'Crédits',
      purchase: 'Acheter des crédits',
    },
    common: {
      loading: 'Chargement...',
      save: 'Enregistrer',
      cancel: 'Annuler',
      delete: 'Supprimer',
      confirm: 'Confirmer',
      search: 'Rechercher',
      noResults: 'Aucun résultat',
      error: 'Une erreur est survenue',
      success: 'Opération réussie',
    },
    ads: {
      close: 'Fermer',
      reward: 'crédit gagné',
      upgrade: 'Passer à Pro pour une expérience sans pub',
      watchToSupport: 'Regardez cette pub pour nous soutenir',
    },
  },
  en: {
    nav: {
      dashboard: 'Dashboard',
      agents: 'Agents',
      billing: 'Billing',
      settings: 'Settings',
      admin: 'Admin',
    },
    auth: {
      login: 'Login',
      register: 'Sign Up',
      logout: 'Logout',
      email: 'Email',
      password: 'Password',
      forgotPassword: 'Forgot password?',
      noAccount: 'Don\'t have an account?',
      hasAccount: 'Already have an account?',
    },
    agents: {
      create: 'Create agent',
      myAgents: 'My agents',
      noAgents: 'No agents yet',
      chat: 'Chat',
      configure: 'Configure',
    },
    billing: {
      plans: 'Plans',
      current: 'Current plan',
      upgrade: 'Upgrade to',
      credits: 'Credits',
      purchase: 'Buy credits',
    },
    common: {
      loading: 'Loading...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      confirm: 'Confirm',
      search: 'Search',
      noResults: 'No results',
      error: 'An error occurred',
      success: 'Operation successful',
    },
    ads: {
      close: 'Close',
      reward: 'credit earned',
      upgrade: 'Go Pro for an ad-free experience',
      watchToSupport: 'Watch this ad to support us',
    },
  },
  pt: {
    nav: {
      dashboard: 'Painel',
      agents: 'Agentes',
      billing: 'Faturação',
      settings: 'Configurações',
      admin: 'Administração',
    },
    auth: {
      login: 'Entrar',
      register: 'Registrar',
      logout: 'Sair',
      email: 'Email',
      password: 'Senha',
      forgotPassword: 'Esqueceu a senha?',
      noAccount: 'Não tem conta?',
      hasAccount: 'Já tem conta?',
    },
    agents: {
      create: 'Criar agente',
      myAgents: 'Meus agentes',
      noAgents: 'Nenhum agente ainda',
      chat: 'Conversa',
      configure: 'Configurar',
    },
    billing: {
      plans: 'Planos',
      current: 'Plano atual',
      upgrade: 'Migrar para',
      credits: 'Créditos',
      purchase: 'Comprar créditos',
    },
    common: {
      loading: 'Carregando...',
      save: 'Salvar',
      cancel: 'Cancelar',
      delete: 'Excluir',
      confirm: 'Confirmar',
      search: 'Pesquisar',
      noResults: 'Sem resultados',
      error: 'Ocorreu um erro',
      success: 'Operação bem-sucedida',
    },
    ads: {
      close: 'Fechar',
      reward: 'crédito ganho',
      upgrade: 'Mude para Pro para uma experiência sem anúncios',
      watchToSupport: 'Assista este anúncio para nos apoiar',
    },
  },
} as const;

export type Messages = typeof messages['fr'];
