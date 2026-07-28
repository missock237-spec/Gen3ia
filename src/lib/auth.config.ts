// Auth Config — NextAuth v5 (Auth.js) Configuration
// Providers: Credentials (email+password), Google, GitHub

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
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email et mot de passe requis');
        }
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          select: { id: true, email: true, name: true, passwordHash: true, role: true, isActive: true },
        });
        if (!user || !user.passwordHash) throw new Error('Email ou mot de passe incorrect');
        if (!user.isActive) throw new Error('Compte desactive. Contactez le support.');
        const valid = await verifyPassword(user.passwordHash, credentials.password);
        if (!valid) throw new Error('Email ou mot de passe incorrect');
        return { id: user.id, email: user.email, name: user.name || user.email.split('@')[0], role: user.role };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: false,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  pages: { signIn: '/login', signOut: '/', error: '/login', verifyRequest: '/verify-email', newUser: '/register' },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Auto-création du compte pour Google et GitHub
      if (account?.provider === 'google' || account?.provider === 'github') {
        const email = user.email || profile?.email;
        if (!email) return false;
        const existing = await db.user.findUnique({ where: { email }, select: { id: true, isActive: true } });
        if (!existing) {
          await db.user.create({
            data: {
              email,
              name: user.name || email.split('@')[0],
              role: 'user',
              isActive: true,
              isEmailVerified: true,
              emailVerified: new Date(),
              credits: 50,
              provider: account.provider,
              providerId: account.providerAccountId,
            },
          });
        } else if (!existing.isActive) {
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) { token.id = user.id; token.role = (user as any).role || 'user'; }
      if (account) { token.provider = account.provider; }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = (token.role as string) || 'user';
        (session.user as any).provider = token.provider as string | undefined;
      }
      return session;
    },
  },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: false,
    }),

    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: false,
    }),
  ],

  pages: {
    signIn: '/login',
    signOut: '/',
    error: '/login',
    verifyRequest: '/verify-email',
    newUser: '/register',
  },

  callbacks: {
    async signIn({ user, account }) {
      // Bloquer si le compte est desactive
      if (!user.isActive && user.isActive !== undefined) return false;
      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role || 'user';
      }
      if (account) {
        token.provider = account.provider;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = (token.role as string) || 'user';
        (session.user as any).provider = token.provider as string | undefined;
      }
      return session;
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  },

  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,

  debug: process.env.NODE_ENV === 'development',
};
