/**
 * Gen3ia — Register page
 *  Branche RegisterForm qui utilise Firebase Auth côté client (popup Google/GitHub
 *  via @/lib/firebase/auth-client + POST /api/auth/register avec idToken).
 *  L'ancienne version utilisait AuthView qui redirigeait vers /api/auth/github
 *  (route inexistante) → 401 middleware.
 */

import { RegisterForm } from '@/components/auth/register-form';

export default function RegisterPage() {
  return <RegisterForm />;
}
