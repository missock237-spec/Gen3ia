import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Email et mot de passe',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password)
          throw new Error('Email et mot de passe requis');
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          select: { id: true, email: true, name: true, password: true, role: true, isActive: true },
        });
        if (!user || !user.password) throw new Error('Email ou mot de passe incorrect');
        if (!user.isActive) throw new Error('Compte desactive');
        const valid = await verifyPassword(user.password, credentials.password);
        if (!valid) throw new Error('Email ou mot de passe incorrect');
        return { id: user.id, email: user.email, name: user.name || user.email.split('@')[0], role: user.role };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    }),
  ],
  pages: { signIn: '/login', signOut: '/', error: '/login', newUser: '/register' },
  callbacks: {
    async signIn({ user }) {
      if ((user as any).isActive === false) return false;
      return true;
    },
    async jwt({ token, user }) {
      if (user) { token.id = user.id; token.role = (user as any).role || 'user'; }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = (token.role as string) || 'user';
      }
      return session;
    },
  },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};