// NextAuth v5 (Auth.js) — Route handler pour l'authentification
// Supporte: Credentials, Google, GitHub

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth.config';





export const dynamic = "force-dynamic";
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };