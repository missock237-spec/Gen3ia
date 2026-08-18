/**
 * GENOVA AI OS — Login Form
 * Email + password login with rememberMe and forgot password link.
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { apiFetch, ApiError } from '@/lib/api';
import { AuthLayout } from './auth-layout';
import { InputField, PasswordInput, Alert, AuthButton, Mail, UserIcon, OAuthButtons } from './shared';

export function LoginForm() {
  const router = useRouter();

  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    if (errors[field]) setErrors(er => ({ ...er, [field]: null }));
    setApiError('');
  };

  const validate = () => {
    const e: Record<string, string | null> = {};
    if (!form.email) e.email = "L'adresse email est requise";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Adresse email invalide';
    if (!form.password) e.password = 'Le mot de passe est requis';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = useCallback(async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setApiError('');

    try {
      // 1. Sign-in via Firebase Client SDK -> obtient l'ID token
      const { signInWithEmail } = await import('@/lib/firebase/auth-client');
      const authResult = await signInWithEmail(form.email, form.password);

      // 2. Envoie l'ID token au serveur qui crée le session cookie Firebase
      const data = await apiFetch<{ user: { id: string; email: string; name: string; role: string; plan: string; avatar?: string | null; emailVerified: boolean } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ idToken: authResult.idToken, rememberMe: form.remember }),
      });

      const user = data.user;
      // Le store d'auth n'expose pas de setter "setUser", mais on peut
      // peupler directement l'état via setState puis rediriger — le session
      // cookie Firebase posé par le serveur garantit que les requêtes suivantes
      // seront authentifiées. hydrate() confirmera au prochain chargement.
      useAuthStore.setState({
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan || 'free',
          role: user.role || 'user',
        },
      });

      router.push('/');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) setApiError(err.message);
        else if (err.status === 429) setApiError('Trop de tentatives. Réessayez dans 15 minutes.');
        else setApiError('Identifiants invalides');
      } else if (err && typeof err === 'object' && 'code' in err) {
        // Firebase Auth error
        const code = (err as { code: string }).code;
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
          setApiError('Identifiants invalides');
        } else if (code === 'auth/too-many-requests') {
          setApiError('Trop de tentatives. Réessayez plus tard.');
        } else if (code === 'auth/email-not-verified') {
          setApiError('Email non vérifié. Consultez votre boîte mail.');
        } else {
          setApiError('Erreur d\'authentification Firebase');
        }
      } else {
        setApiError('Erreur réseau. Veuillez réessayer.');
      }
    } finally {
      setLoading(false);
    }
  }, [form, router]);

  return (
    <AuthLayout title="Bon retour" subtitle="Connectez-vous à votre espace Genova">
      {/* OAuth — Google + GitHub via Firebase (popup) */}
      <div className="space-y-3">
        <OAuthButtons
          mode="login"
          disabled={loading}
          onError={(msg) => setApiError(msg)}
          onSuccess={() => {
            // La route /api/auth/login a posé le session cookie Firebase.
            // On hydrate le store d'auth (lit le cookie via GET /api/auth/me)
            // puis on redirige vers le dashboard.
            void useAuthStore.getState().hydrate();
            router.push('/');
          }}
        />
        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-slate-700/40"></div>
          <span className="text-xs text-slate-500 uppercase tracking-wider">ou</span>
          <div className="h-px flex-1 bg-slate-700/40"></div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Alert type="error" message={apiError} />

        <InputField
          label="Adresse email"
          id="login-email"
          type="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          icon={<Mail className="w-4 h-4" />}
          placeholder="vous@exemple.com"
          autoComplete="email"
          disabled={loading}
        />

        <PasswordInput
          label="Mot de passe"
          id="login-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          placeholder="••••••••"
          autoComplete="current-password"
          disabled={loading}
        />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.remember}
              onChange={set('remember')}
              className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-slate-950"
            />
            <span className="text-xs text-slate-400">Se souvenir de moi</span>
          </label>
          <button
            type="button"
            onClick={() => router.push('/forgot-password')}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
          >
            Mot de passe oublié ?
          </button>
        </div>

        <AuthButton type="submit" loading={loading}>
          Se connecter
        </AuthButton>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Pas encore de compte ?{' '}
        <button onClick={() => router.push('/register')} className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
          Créer un compte
        </button>
      </p>
    </AuthLayout>
  );
}
