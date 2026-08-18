/**
 * Gen3ia — Login page
 *  Branche LoginForm qui utilise Firebase Auth côté client (popup Google/GitHub
 *  via @/lib/firebase/auth-client + POST /api/auth/login avec idToken).
 *  L'ancienne version utilisait AuthView qui redirigeait vers /api/auth/google
 *  (route inexistante) → 401 middleware.
 */

import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return <LoginForm />;
}
