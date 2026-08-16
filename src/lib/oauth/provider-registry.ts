export interface OAuthProvider {
  name: string;
  label: string;
  authorizationUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  scopes: string[];
  defaultScopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  pkce: boolean;
  grantType: 'authorization_code' | 'client_credentials';
  extraParams?: Record<string, string>;
}

const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  github: { name: 'github', label: 'GitHub', authorizationUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token', revokeUrl: 'https://api.github.com/applications/{client_id}/grant', scopes: ['repo','user','workflow','admin:repo_hook','read:org'], defaultScopes: ['repo','user'], clientIdEnv: 'GITHUB_CLIENT_ID', clientSecretEnv: 'GITHUB_CLIENT_SECRET', pkce: false, grantType: 'authorization_code' },
  google: { name: 'google', label: 'Google', authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', revokeUrl: 'https://oauth2.googleapis.com/revoke', scopes: ['https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/calendar','https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/documents'], defaultScopes: ['https://www.googleapis.com/auth/userinfo.email'], clientIdEnv: 'GOOGLE_CLIENT_ID', clientSecretEnv: 'GOOGLE_CLIENT_SECRET', pkce: true, grantType: 'authorization_code' },
  gmail: { name: 'gmail', label: 'Gmail', authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.modify'], defaultScopes: ['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send'], clientIdEnv: 'GOOGLE_CLIENT_ID', clientSecretEnv: 'GOOGLE_CLIENT_SECRET', pkce: true, grantType: 'authorization_code' },
  google_calendar: { name: 'google_calendar', label: 'Google Calendar', authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/calendar','https://www.googleapis.com/auth/calendar.events'], defaultScopes: ['https://www.googleapis.com/auth/calendar'], clientIdEnv: 'GOOGLE_CLIENT_ID', clientSecretEnv: 'GOOGLE_CLIENT_SECRET', pkce: true, grantType: 'authorization_code' },
  google_drive: { name: 'google_drive', label: 'Google Drive', authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/drive.file'], defaultScopes: ['https://www.googleapis.com/auth/drive.file'], clientIdEnv: 'GOOGLE_CLIENT_ID', clientSecretEnv: 'GOOGLE_CLIENT_SECRET', pkce: true, grantType: 'authorization_code' },
  google_sheets: { name: 'google_sheets', label: 'Google Sheets', authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive.file'], defaultScopes: ['https://www.googleapis.com/auth/spreadsheets'], clientIdEnv: 'GOOGLE_CLIENT_ID', clientSecretEnv: 'GOOGLE_CLIENT_SECRET', pkce: true, grantType: 'authorization_code' },
  microsoft: { name: 'microsoft', label: 'Microsoft', authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', scopes: ['User.Read','Mail.Read','Mail.Send','Calendars.Read','Files.Read'], defaultScopes: ['User.Read'], clientIdEnv: 'MICROSOFT_CLIENT_ID', clientSecretEnv: 'MICROSOFT_CLIENT_SECRET', pkce: true, grantType: 'authorization_code' },
  slack: { name: 'slack', label: 'Slack', authorizationUrl: 'https://slack.com/oauth/v2/authorize', tokenUrl: 'https://slack.com/api/oauth.v2.access', scopes: ['channels:read','channels:history','chat:write','users:read','files:read','files:write'], defaultScopes: ['channels:read','chat:write'], clientIdEnv: 'SLACK_CLIENT_ID', clientSecretEnv: 'SLACK_CLIENT_SECRET', pkce: false, grantType: 'authorization_code' },
  discord: { name: 'discord', label: 'Discord', authorizationUrl: 'https://discord.com/api/oauth2/authorize', tokenUrl: 'https://discord.com/api/oauth2/token', scopes: ['identify','email','guilds','messages.read','bot'], defaultScopes: ['identify','email'], clientIdEnv: 'DISCORD_CLIENT_ID', clientSecretEnv: 'DISCORD_CLIENT_SECRET', pkce: false, grantType: 'authorization_code' },
  twitter: { name: 'twitter', label: 'Twitter / X', authorizationUrl: 'https://twitter.com/i/oauth2/authorize', tokenUrl: 'https://api.twitter.com/2/oauth2/token', scopes: ['tweet.read','tweet.write','users.read','offline.access','dm.read','dm.write'], defaultScopes: ['tweet.read','tweet.write','users.read','offline.access'], clientIdEnv: 'TWITTER_CLIENT_ID', clientSecretEnv: 'TWITTER_CLIENT_SECRET', pkce: true, grantType: 'authorization_code' },
  linkedin: { name: 'linkedin', label: 'LinkedIn', authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization', tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken', scopes: ['openid','profile','email','w_member_social'], defaultScopes: ['openid','profile','email','w_member_social'], clientIdEnv: 'LINKEDIN_CLIENT_ID', clientSecretEnv: 'LINKEDIN_CLIENT_SECRET', pkce: false, grantType: 'authorization_code' },
  notion: { name: 'notion', label: 'Notion', authorizationUrl: 'https://api.notion.com/v1/oauth/authorize', tokenUrl: 'https://api.notion.com/v1/oauth/token', scopes: [], defaultScopes: [], clientIdEnv: 'NOTION_CLIENT_ID', clientSecretEnv: 'NOTION_CLIENT_SECRET', pkce: false, grantType: 'authorization_code' },
  stripe: { name: 'stripe', label: 'Stripe', authorizationUrl: 'https://connect.stripe.com/oauth/authorize', tokenUrl: 'https://connect.stripe.com/oauth/token', scopes: ['read_write'], defaultScopes: ['read_write'], clientIdEnv: 'STRIPE_CLIENT_ID', clientSecretEnv: 'STRIPE_SECRET_KEY', pkce: false, grantType: 'authorization_code' },
  shopify: { name: 'shopify', label: 'Shopify', authorizationUrl: 'https://{shop}.myshopify.com/admin/oauth/authorize', tokenUrl: 'https://{shop}.myshopify.com/admin/oauth/access_token', scopes: ['read_products','write_products','read_orders','write_orders','read_customers'], defaultScopes: ['read_products','read_orders'], clientIdEnv: 'SHOPIFY_CLIENT_ID', clientSecretEnv: 'SHOPIFY_CLIENT_SECRET', pkce: false, grantType: 'authorization_code' },
  salesforce: { name: 'salesforce', label: 'Salesforce', authorizationUrl: 'https://login.salesforce.com/services/oauth2/authorize', tokenUrl: 'https://login.salesforce.com/services/oauth2/token', scopes: ['api','refresh_token','offline_access','id','openid'], defaultScopes: ['api','refresh_token','offline_access'], clientIdEnv: 'SALESFORCE_CLIENT_ID', clientSecretEnv: 'SALESFORCE_CLIENT_SECRET', pkce: false, grantType: 'authorization_code' },
  hubspot: { name: 'hubspot', label: 'HubSpot', authorizationUrl: 'https://app.hubspot.com/oauth/authorize', tokenUrl: 'https://api.hubapi.com/oauth/v1/token', scopes: ['crm.objects.contacts.read','crm.objects.contacts.write','crm.objects.deals.read','crm.objects.companies.read','content'], defaultScopes: ['crm.objects.contacts.read','crm.objects.deals.read'], clientIdEnv: 'HUBSPOT_CLIENT_ID', clientSecretEnv: 'HUBSPOT_CLIENT_SECRET', pkce: false, grantType: 'authorization_code' },
  dropbox: { name: 'dropbox', label: 'Dropbox', authorizationUrl: 'https://www.dropbox.com/oauth2/authorize', tokenUrl: 'https://api.dropboxapi.com/oauth2/token', scopes: ['files.metadata.read','files.content.read','files.content.write','sharing.read'], defaultScopes: ['files.metadata.read','files.content.read'], clientIdEnv: 'DROPBOX_CLIENT_ID', clientSecretEnv: 'DROPBOX_CLIENT_SECRET', pkce: true, grantType: 'authorization_code' },
  figma: { name: 'figma', label: 'Figma', authorizationUrl: 'https://www.figma.com/oauth', tokenUrl: 'https://www.figma.com/api/oauth/token', scopes: ['file_read','file_write','comment_read','comment_write'], defaultScopes: ['file_read'], clientIdEnv: 'FIGMA_CLIENT_ID', clientSecretEnv: 'FIGMA_CLIENT_SECRET', pkce: false, grantType: 'authorization_code' },
  spotify: { name: 'spotify', label: 'Spotify', authorizationUrl: 'https://accounts.spotify.com/authorize', tokenUrl: 'https://accounts.spotify.com/api/token', scopes: ['user-read-private','user-read-email','playlist-read-private','playlist-modify-public','user-top-read'], defaultScopes: ['user-read-private','user-read-email','playlist-read-private'], clientIdEnv: 'SPOTIFY_CLIENT_ID', clientSecretEnv: 'SPOTIFY_CLIENT_SECRET', pkce: true, grantType: 'authorization_code' },
  zoom: { name: 'zoom', label: 'Zoom', authorizationUrl: 'https://zoom.us/oauth/authorize', tokenUrl: 'https://zoom.us/oauth/token', scopes: ['meeting:write','meeting:read','user:read','recording:read'], defaultScopes: ['meeting:write','meeting:read','user:read'], clientIdEnv: 'ZOOM_CLIENT_ID', clientSecretEnv: 'ZOOM_CLIENT_SECRET', pkce: false, grantType: 'authorization_code' },
  twilio: { name: 'twilio', label: 'Twilio', authorizationUrl: 'https://www.twilio.com/oauth/v2/authorize', tokenUrl: 'https://www.twilio.com/oauth/v2/token', scopes: [], defaultScopes: [], clientIdEnv: 'TWILIO_ACCOUNT_SID', clientSecretEnv: 'TWILIO_AUTH_TOKEN', pkce: false, grantType: 'authorization_code' },
  openai: { name: 'openai', label: 'OpenAI', authorizationUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://api.openai.com/v1/oauth/token', scopes: [], defaultScopes: [], clientIdEnv: 'OPENAI_CLIENT_ID', clientSecretEnv: 'OPENAI_API_KEY', pkce: false, grantType: 'client_credentials' },
  vercel: { name: 'vercel', label: 'Vercel', authorizationUrl: 'https://vercel.com/integrations/oauth/authorize', tokenUrl: 'https://api.vercel.com/v2/oauth/access_token', scopes: [], defaultScopes: [], clientIdEnv: 'VERCEL_CLIENT_ID', clientSecretEnv: 'VERCEL_CLIENT_SECRET', pkce: false, grantType: 'authorization_code' },
  stripe_payments: { name: 'stripe_payments', label: 'Stripe Payments', authorizationUrl: 'https://connect.stripe.com/oauth/authorize', tokenUrl: 'https://connect.stripe.com/oauth/token', scopes: ['read_write'], defaultScopes: ['read_write'], clientIdEnv: 'STRIPE_CLIENT_ID', clientSecretEnv: 'STRIPE_SECRET_KEY', pkce: false, grantType: 'authorization_code' },
  stripe_connect: { name: 'stripe_connect', label: 'Stripe Connect', authorizationUrl: 'https://connect.stripe.com/express/oauth/authorize', tokenUrl: 'https://connect.stripe.com/oauth/token', scopes: ['read_write'], defaultScopes: ['read_write'], clientIdEnv: 'STRIPE_CLIENT_ID', clientSecretEnv: 'STRIPE_SECRET_KEY', pkce: false, grantType: 'authorization_code' },
};

export function getOAuthProvider(name: string): OAuthProvider | undefined {
  return OAUTH_PROVIDERS[name];
}

export function getAllOAuthProviders(): string[] {
  return Object.keys(OAUTH_PROVIDERS);
}

export function buildAuthorizationUrl(provider: OAuthProvider, redirectUri: string, state: string): string {
  const params = new URLSearchParams();
  params.set('client_id', `{{${provider.clientIdEnv}}}`);
  params.set('redirect_uri', redirectUri);
  params.set('response_type', 'code');
  params.set('scope', provider.defaultScopes.join(' '));
  params.set('state', state);
  params.set('access_type', 'offline');
  params.set('prompt', 'consent');
  const base = provider.authorizationUrl.replace(/\(.*?\)/g, '');
  return `${base}?${params.toString()}`;
}
