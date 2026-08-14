/**
 * Service OAuth pour Google et GitHub
 */

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface OAuthProfile {
  provider: 'google' | 'github';
  providerId: string;
  email: string;
  name: string;
  avatar: string | null;
}

function getGoogleConfig(): OAuthConfig {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/google/callback`,
  };
}

function getGitHubConfig(): OAuthConfig {
  return {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/github/callback`,
  };
}

export function getGoogleAuthUrl(state: string): string {
  const config = getGoogleConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function getGitHubAuthUrl(state: string): string {
  const config = getGitHubConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'read:user user:email',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function getGoogleProfile(code: string): Promise<OAuthProfile> {
  const config = getGoogleConfig();
  
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) throw new Error('Google token exchange failed');
  const tokens = await tokenRes.json();

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) throw new Error('Google profile fetch failed');
  const profile = await profileRes.json();

  return {
    provider: 'google',
    providerId: profile.id,
    email: profile.email,
    name: profile.name || profile.email.split('@')[0],
    avatar: profile.picture || null,
  };
}

export async function getGitHubProfile(code: string): Promise<OAuthProfile> {
  const config = getGitHubConfig();

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!tokenRes.ok) throw new Error('GitHub token exchange failed');
  const tokens = await tokenRes.json();

  const profileRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) throw new Error('GitHub profile fetch failed');
  const profile = await profileRes.json();

  let email = profile.email;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (emailsRes.ok) {
      const emails = await emailsRes.json();
      const primary = emails.find((e: any) => e.primary && e.verified);
      email = primary?.email || emails[0]?.email;
    }
  }

  return {
    provider: 'github',
    providerId: profile.id.toString(),
    email: email || '',
    name: profile.name || profile.login,
    avatar: profile.avatar_url || null,
  };
}

// Stockage simple des states OAuth
const stateStore = new Map<string, { timestamp: number; provider: string }>();

export function generateOAuthState(provider: string): string {
  const { randomBytes } = require('crypto');
  const state = randomBytes(32).toString('hex');
  stateStore.set(state, { timestamp: Date.now(), provider });
  
  // Nettoyer les states expirés (> 10 min)
  for (const [key, val] of stateStore) {
    if (Date.now() - val.timestamp > 600000) stateStore.delete(key);
  }
  
  return state;
}

export function verifyOAuthState(state: string, expectedProvider: string): boolean {
  const entry = stateStore.get(state);
  if (!entry) return false;
  if (entry.provider !== expectedProvider) return false;
  if (Date.now() - entry.timestamp > 600000) {
    stateStore.delete(state);
    return false;
  }
  stateStore.delete(state);
  return true;
}
