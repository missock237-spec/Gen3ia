/**
 * GENOVA AI OS — Auth Shared Components & Constants
 * Shared sub-components used across all auth forms.
 */

'use client';

import { useState, type ReactNode } from 'react';
import { Eye, EyeOff, Lock, Mail, User, Check, X, ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';

// ─── PASSWORD RULES & STRENGTH ───────────────────────────────────────────────

export const PASSWORD_RULES = [
  { id: 'length',    label: 'Minimum 8 caractères',          regex: /.{8,}/        },
  { id: 'uppercase', label: '1 lettre majuscule',            regex: /[A-Z]/        },
  { id: 'lowercase', label: '1 lettre minuscule',            regex: /[a-z]/        },
  { id: 'digit',     label: '1 chiffre',                     regex: /[0-9]/        },
  { id: 'special',   label: '1 caractère spécial (!@#$...)', regex: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/ },
];

export function getStrength(password: string): number {
  return PASSWORD_RULES.filter(r => r.regex.test(password)).length;
}

export const STRENGTH_CONFIG = [
  { label: '',           color: 'bg-gray-700',   textColor: 'text-gray-500'  },
  { label: 'Très faible', color: 'bg-red-500',    textColor: 'text-red-400'   },
  { label: 'Faible',     color: 'bg-orange-500', textColor: 'text-orange-400'},
  { label: 'Moyen',      color: 'bg-yellow-500', textColor: 'text-yellow-400'},
  { label: 'Fort',       color: 'bg-blue-500',   textColor: 'text-blue-400'  },
  { label: 'Très fort',  color: 'bg-emerald-500',textColor: 'text-emerald-400'},
];

// ─── INPUT FIELD ─────────────────────────────────────────────────────────────

interface InputFieldProps {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string | null;
  icon?: ReactNode;
  rightElement?: ReactNode;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
}

export function InputField({
  label, id, type = 'text', value, onChange, error, icon, rightElement,
  placeholder, autoComplete, disabled = false,
}: InputFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium tracking-widest uppercase text-slate-400">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            {icon}
          </div>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`
            w-full bg-slate-900/80 border rounded-xl px-4 py-3 text-sm text-slate-100
            placeholder:text-slate-600 transition-all duration-200 outline-none
            focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/70
            disabled:opacity-50 disabled:cursor-not-allowed
            ${icon ? 'pl-10' : ''}
            ${rightElement ? 'pr-10' : ''}
            ${error ? 'border-red-500/70 bg-red-900/10' : 'border-slate-700/60 hover:border-slate-600'}
          `}
        />
        {rightElement && (
          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1">
          <span className="inline-block w-3.5 h-3.5 rounded-full bg-red-500/20 text-red-400 flex-shrink-0 flex items-center justify-center">
            <X className="w-2.5 h-2.5" />
          </span>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── PASSWORD INPUT ──────────────────────────────────────────────────────────

interface PasswordInputProps {
  label: string;
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string | null;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
}

export function PasswordInput({
  label, id, value, onChange, error, placeholder, autoComplete, disabled,
}: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <InputField
      label={label}
      id={id}
      type={show ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      error={error}
      placeholder={placeholder}
      autoComplete={autoComplete}
      disabled={disabled}
      icon={<Lock className="w-4 h-4" />}
      rightElement={
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="text-slate-500 hover:text-slate-300 transition-colors"
          tabIndex={-1}
          aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      }
    />
  );
}

// ─── PASSWORD STRENGTH INDICATOR ─────────────────────────────────────────────

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const strength = getStrength(password);
  const cfg = STRENGTH_CONFIG[strength];
  if (!password) return null;

  return (
    <div className="space-y-2.5 p-3.5 rounded-xl border border-slate-700/50 bg-slate-900/60">
      {/* Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">Force du mot de passe</span>
          <span className={`text-xs font-semibold ${cfg.textColor}`}>{cfg.label}</span>
        </div>
        <div className="flex gap-1">
          {[1,2,3,4,5].map(i => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i <= strength ? cfg.color : 'bg-slate-700/50'
              }`}
            />
          ))}
        </div>
      </div>
      {/* Rules */}
      <div className="grid grid-cols-1 gap-1">
        {PASSWORD_RULES.map(rule => {
          const ok = rule.regex.test(password);
          return (
            <div key={rule.id} className={`flex items-center gap-2 text-xs transition-colors ${ok ? 'text-emerald-400' : 'text-slate-500'}`}>
              <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-colors ${ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-600'}`}>
                {ok ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
              </span>
              {rule.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ALERT ───────────────────────────────────────────────────────────────────

interface AlertProps {
  type?: 'error' | 'success' | 'info';
  message?: string | null;
}

export function Alert({ type = 'error', message }: AlertProps) {
  if (!message) return null;
  const styles = {
    error:   'bg-red-900/30 border-red-500/40 text-red-300',
    success: 'bg-emerald-900/30 border-emerald-500/40 text-emerald-300',
    info:    'bg-blue-900/30 border-blue-500/40 text-blue-300',
  };
  return (
    <div className={`px-4 py-3 rounded-xl border text-sm ${styles[type]}`}>
      {message}
    </div>
  );
}

// ─── BUTTON ──────────────────────────────────────────────────────────────────

interface AuthButtonProps {
  children: ReactNode;
  type?: 'button' | 'submit';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
  className?: string;
}

export function AuthButton({
  children, type = 'button', loading = false, disabled = false,
  onClick, variant = 'primary', className = '',
}: AuthButtonProps) {
  const base = 'relative w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 focus:ring-cyan-500',
    ghost:   'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 focus:ring-slate-500 border border-slate-700/50',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

// ─── GLOW ORB ────────────────────────────────────────────────────────────────

interface GlowOrbProps {
  color: string;
  size: string;
  top: string;
  left: string;
  opacity?: number;
}

export function GlowOrb({ color, size, top, left, opacity = 0.15 }: GlowOrbProps) {
  return (
    <div
      className="absolute rounded-full blur-3xl pointer-events-none"
      style={{ width: size, height: size, top, left, background: color, opacity }}
    />
  );
}

// ─── ANIMATED BACKGROUND ─────────────────────────────────────────────────────

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#06b6d4 1px, transparent 1px), linear-gradient(90deg, #06b6d4 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      {/* Orbs */}
      <GlowOrb color="#06b6d4" size="500px" top="-150px" left="-100px" opacity={0.08} />
      <GlowOrb color="#3b82f6" size="400px" top="60%" left="70%" opacity={0.06} />
      <GlowOrb color="#8b5cf6" size="300px" top="30%" left="80%" opacity={0.04} />
      {/* Scan line */}
      <div
        className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"
        style={{ animation: 'scanline 6s linear infinite', top: 0 }}
      />
      <style>{`
        @keyframes scanline {
          0%   { transform: translateY(0); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── FEATURES PANEL ──────────────────────────────────────────────────────────

const FEATURES = [
  { icon: '🤖', title: 'Agents IA Autonomes',   desc: 'Multi-agents avec boucle ReAct & LangGraph'    },
  { icon: '🧠', title: 'Mémoire 3 Niveaux',     desc: 'Court terme, long terme & épisodique'           },
  { icon: '🔗', title: 'Orchestration Avancée', desc: 'Workflows, n8n & coordination multi-agents'    },
  { icon: '🎨', title: 'Génération Médias',      desc: 'Images ComfyUI + Vidéos CogVideoX-2B'          },
  { icon: '🔒', title: 'Sécurité Entreprise',   desc: 'PBKDF2, RBAC, audit logs & garde-fous'         },
];

export function FeaturesPanel() {
  return (
    <div className="hidden lg:flex flex-col justify-center px-12 xl:px-16 space-y-10">
      <div className="space-y-2">
        <div className="text-xs font-mono text-cyan-400/70 tracking-[0.3em] uppercase mb-4">
          Plateforme IA
        </div>
        <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight">
          L&apos;OS pour vos<br />
          <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Agents Intelligents
          </span>
        </h2>
        <p className="text-slate-400 text-base max-w-sm">
          Créez, orchestrez et supervisez des agents IA autonomes sur une seule plateforme.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {FEATURES.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/40 border border-slate-700/30 hover:border-cyan-500/30 hover:bg-slate-800/60 transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-700/60 flex items-center justify-center text-lg flex-shrink-0 group-hover:bg-cyan-500/15 transition-colors">
              {f.icon}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-200">{f.title}</div>
              <div className="text-xs text-slate-500">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── OAUTH BUTTONS (Google + GitHub via Firebase popup) ──────────────────────

interface OAuthButtonsProps {
  /** 'login' appelle POST /api/auth/login, 'register' appelle POST /api/auth/register */
  mode: 'login' | 'register';
  disabled?: boolean;
  onError?: (msg: string) => void;
  onSuccess?: () => void;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.014-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.071 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.087.636-1.337-2.22-.253-4.555-1.111-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0022 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

/**
 * OAuthButtons — boutons "Continuer avec Google" / "Continuer avec GitHub".
 *
 * Desktop : signInWithPopup (popup) -> idToken -> POST serveur.
 * Mobile  : signInWithRedirect -> la page se recharge ->
 *           useEffect détecte getRedirectResult -> POST serveur.
 *
 * Le mode ('login' | 'register') est stocké dans sessionStorage
 * avant le redirect mobile pour savoir quelle route appeler au retour.
 *
 * Gestion d'erreur Firebase (codes auth/*) traduits en français.
 */
export function OAuthButtons({ mode, disabled, onError, onSuccess }: OAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<null | 'google' | 'github'>(null);

  const translateFirebaseError = (code: string): string => {
    const map: Record<string, string> = {
      'auth/popup-closed-by-user': 'Fenêtre fermée avant la fin de la connexion.',
      'auth/popup-blocked': 'Le popup a été bloqué par le navigateur. Autorisez les popups puis réessayez.',
      'auth/cancelled-popup-request': 'Connexion annulée.',
      'auth/operation-not-allowed': "Ce fournisseur n'est pas activé. Contactez l'administrateur.",
      'auth/account-exists-with-different-credential': 'Un compte existe déjà avec cet email via un autre fournisseur.',
      'auth/unauthorized-domain': "Ce domaine n'est pas autorisé dans la console Firebase.",
      'auth/network-request-failed': 'Erreur réseau. Vérifiez votre connexion.',
      'auth/internal-error': 'Erreur interne Firebase. Réessayez.',
      'auth/configuration-not-found': 'Erreur de configuration Firebase. Contactez l\'administrateur.',
      'auth/invalid-api-key': 'Erreur de configuration. Contactez l\'administrateur.',
      'auth/app-not-authorized': 'Application non autorisée. Contactez l\'administrateur.',
      'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard.',
    };
    return map[code] || 'Erreur d\'authentification. Réessayez.';
  };

  /**
   * Envoie l'idToken au serveur pour créer le session cookie.
     * Utilisé après popup (desktop) ou redirect (mobile).
   */
  const sendTokenToServer = async (idToken: string, displayName?: string | null) => {
    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          idToken,
          ...(mode === 'register' && displayName ? { name: displayName } : {}),
        }),
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        let msg = 'Erreur lors de la connexion.';
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {}
        onError?.(msg);
        return false;
      }
      return true;
    } catch {
      clearTimeout(timeoutId);
      onError?.('Erreur reseau. Verifiez votre connexion.');
      return false;
    }
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    if (disabled || loadingProvider) return;
    setLoadingProvider(provider);
    try {
      // Stocke le contexte OAuth pour le redirect mobile.
      // Utilise localStorage (pas sessionStorage) car les Custom Tabs
      // Android perdent le sessionStorage au retour.
      if (typeof window !== 'undefined') {
        const { saveOAuthContext } = await import('@/hooks/use-oauth-redirect');
        saveOAuthContext(mode, provider);
      }

      // 1. signIn cote client (Firebase Client SDK) -> idToken
      const { signInWithGoogle, signInWithGithub, isMobileDevice } = await import('@/lib/firebase/auth-client');

      // Sur mobile, signInWithRedirect ne revient jamais ici (la page se recharge)
      if (isMobileDevice()) {
        if (provider === 'google') await signInWithGoogle();
        else await signInWithGithub();
        // Ne pas executer le code ci-dessous apres un redirect
        return;
      }

      const authResult = provider === 'google'
        ? await signInWithGoogle()
        : await signInWithGithub();

      // 2. POST l'idToken au serveur (desktop : on a le résultat immédiatement)
      const ok = await sendTokenToServer(authResult.idToken, authResult.displayName);
      if (ok) onSuccess?.();
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string }).code;
        // Ne pas afficher d'erreur pour le redirect mobile (c'est normal)
        if (code === 'auth/redirect') return;
        onError?.(translateFirebaseError(code));
      } else if (err instanceof Error) {
        onError?.(err.message);
      } else {
        onError?.('Erreur inconnue. Réessayez.');
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const isDisabled = disabled || loadingProvider !== null;

  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={() => handleOAuth('google')}
        disabled={isDisabled}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700/60 bg-slate-900/60 hover:bg-slate-800/80 hover:border-slate-600 text-slate-200 text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loadingProvider === 'google' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Google
      </button>
      <button
        type="button"
        onClick={() => handleOAuth('github')}
        disabled={isDisabled}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700/60 bg-slate-900/60 hover:bg-slate-800/80 hover:border-slate-600 text-slate-200 text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loadingProvider === 'github' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <GithubIcon />
        )}
        GitHub
      </button>
    </div>
  );
}

// ─── ICONS (re-exported from lucide-react for convenience) ───────────────────

export { Mail, User as UserIcon, Lock, Eye, EyeOff, Check, X, ArrowLeft, ShieldCheck, Loader2 };
