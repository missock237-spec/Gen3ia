'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Plug, Github, Mail, Slack, Chrome, Cloud, Twitter, Linkedin, Music, Database,
  Trash2, RefreshCw, CheckCircle2, Loader2, Search, Code, Megaphone, ShoppingCart,
  FileText, BarChart3, MessageCircle, Film, Terminal, Palette, Shield, Zap, Globe,
  BookOpen, CreditCard, Phone, Brain, HardDrive, Activity, Users, Layers, Bell,
  Monitor, Smile, Headphones, FolderOpen, Key, Image, MapPin, Timer, Rocket, Send,
  ArrowLeft, ArrowRight, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Authorization {
  id: string;
  service: string;
  accountId: string;
  accountName: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface ServiceDef {
  label: string;
  icon: React.ElementType;
  color: string;
  category: string;
}

const CATEGORIES: Record<string, { label: string; icon: React.ElementType }> = {
  vcs: { label: 'Version Control', icon: Code },
  google: { label: 'Google', icon: Chrome },
  microsoft: { label: 'Microsoft', icon: Monitor },
  messaging: { label: 'Messagerie', icon: MessageCircle },
  social: { label: 'Reseaux Sociaux', icon: Globe },
  productivity: { label: 'Productivite', icon: FileText },
  ecommerce: { label: 'E-commerce', icon: ShoppingCart },
  cloud: { label: 'Cloud & hebergement', icon: Cloud },
  crm: { label: 'CRM', icon: Users },
  support: { label: 'Support Client', icon: Headphones },
  email: { label: 'Email Marketing', icon: Send },
  accounting: { label: 'Comptabilite', icon: CreditCard },
  telephony: { label: 'Telephonie', icon: Phone },
  ai: { label: 'IA & Machine Learning', icon: Brain },
  database: { label: 'Bases de donnees', icon: Database },
  monitoring: { label: 'Monitoring', icon: Activity },
  devops: { label: 'DevOps & CI/CD', icon: Terminal },
  design: { label: 'Design', icon: Palette },
  media: { label: 'Media & Musique', icon: Music },
  storage: { label: 'Stockage', icon: FolderOpen },
  auth: { label: 'Authentification', icon: Shield },
  email_tx: { label: 'Email Transactionnel', icon: Mail },
  calendar: { label: 'Calendrier', icon: Bell },
  forms: { label: 'Formulaires', icon: FileText },
  analytics: { label: 'Analytics', icon: BarChart3 },
  object_storage: { label: 'Stockage Objet', icon: Image },
  maps: { label: 'Cartes & Geographie', icon: MapPin },
  search: { label: 'Recherche', icon: Search },
  queues: { label: 'Files d attente', icon: Timer },
  hosting: { label: 'Hebergement Alt.', icon: Rocket },
  devtools: { label: 'Outils Dev', icon: Terminal },
  image_gen: { label: 'Generation Image IA', icon: Image },
  video_gen: { label: 'Generation Video IA', icon: Film },
  tts: { label: 'Text-to-Speech', icon: Headphones },
};

const SERVICES: Record<string, ServiceDef> = {
  'github': { label: 'GitHub', icon: Github, color: 'text-gray-900 dark:text-white', category: 'vcs' },
  'gitlab': { label: 'GitLab', icon: Code, color: 'text-orange-500', category: 'vcs' },
  'bitbucket': { label: 'Bitbucket', icon: Code, color: 'text-blue-500', category: 'vcs' },
  'gitea': { label: 'Gitea', icon: Code, color: 'text-green-600', category: 'vcs' },
  'gogs': { label: 'Gogs', icon: Code, color: 'text-gray-500', category: 'vcs' },
  'sourceforge': { label: 'SourceForge', icon: Code, color: 'text-orange-600', category: 'vcs' },
  'codeberg': { label: 'Codeberg', icon: Code, color: 'text-blue-400', category: 'vcs' },
  'google': { label: 'Google', icon: Chrome, color: 'text-blue-500', category: 'google' },
  'gmail': { label: 'Gmail', icon: Mail, color: 'text-red-500', category: 'google' },
  'google_calendar': { label: 'Google Calendar', icon: Chrome, color: 'text-blue-400', category: 'google' },
  'google_drive': { label: 'Google Drive', icon: Cloud, color: 'text-yellow-500', category: 'google' },
  'google_photos': { label: 'Google Photos', icon: Image, color: 'text-green-500', category: 'google' },
  'google_maps': { label: 'Google Maps', icon: MapPin, color: 'text-green-600', category: 'google' },
  'google_analytics': { label: 'Google Analytics', icon: BarChart3, color: 'text-orange-500', category: 'google' },
  'google_ads': { label: 'Google Ads', icon: Megaphone, color: 'text-blue-500', category: 'google' },
  'google_cloud': { label: 'Google Cloud', icon: Cloud, color: 'text-blue-500', category: 'google' },
  'google_sheets': { label: 'Google Sheets', icon: FileText, color: 'text-green-600', category: 'google' },
  'google_docs': { label: 'Google Docs', icon: FileText, color: 'text-blue-400', category: 'google' },
  'google_slides': { label: 'Google Slides', icon: FileText, color: 'text-orange-400', category: 'google' },
  'google_forms': { label: 'Google Forms', icon: FileText, color: 'text-purple-500', category: 'google' },
  'google_meet': { label: 'Google Meet', icon: VideoIcon, color: 'text-green-500', category: 'google' },
  'google_chat': { label: 'Google Chat', icon: MessageCircle, color: 'text-blue-400', category: 'google' },
  'google_play': { label: 'Google Play', icon: ShoppingCart, color: 'text-green-500', category: 'google' },
  'microsoft': { label: 'Microsoft', icon: Monitor, color: 'text-blue-600', category: 'microsoft' },
  'outlook': { label: 'Outlook', icon: Mail, color: 'text-blue-500', category: 'microsoft' },
  'office365': { label: 'Office 365', icon: FileText, color: 'text-red-500', category: 'microsoft' },
  'microsoft_teams': { label: 'Microsoft Teams', icon: MessageCircle, color: 'text-purple-500', category: 'microsoft' },
  'microsoft_sharepoint': { label: 'SharePoint', icon: FolderOpen, color: 'text-blue-600', category: 'microsoft' },
  'microsoft_onedrive': { label: 'OneDrive', icon: Cloud, color: 'text-blue-500', category: 'microsoft' },
  'microsoft_azure': { label: 'Azure', icon: Cloud, color: 'text-blue-500', category: 'microsoft' },
  'microsoft_power_bi': { label: 'Power BI', icon: BarChart3, color: 'text-yellow-500', category: 'microsoft' },
  'slack': { label: 'Slack', icon: Slack, color: 'text-purple-500', category: 'messaging' },
  'discord': { label: 'Discord', icon: MessageCircle, color: 'text-indigo-500', category: 'messaging' },
  'telegram': { label: 'Telegram', icon: Send, color: 'text-blue-400', category: 'messaging' },
  'whatsapp': { label: 'WhatsApp', icon: MessageCircle, color: 'text-green-500', category: 'messaging' },
  'messenger': { label: 'Messenger', icon: MessageCircle, color: 'text-blue-500', category: 'messaging' },
  'signal': { label: 'Signal', icon: MessageCircle, color: 'text-green-400', category: 'messaging' },
  'wechat': { label: 'WeChat', icon: MessageCircle, color: 'text-green-600', category: 'messaging' },
  'line': { label: 'LINE', icon: MessageCircle, color: 'text-green-500', category: 'messaging' },
  'skype': { label: 'Skype', icon: MessageCircle, color: 'text-blue-400', category: 'messaging' },
  'zoom': { label: 'Zoom', icon: VideoIcon, color: 'text-blue-500', category: 'messaging' },
  'twitter': { label: 'Twitter / X', icon: Twitter, color: 'text-sky-500', category: 'social' },
  'linkedin': { label: 'LinkedIn', icon: Linkedin, color: 'text-blue-600', category: 'social' },
  'instagram': { label: 'Instagram', icon: Image, color: 'text-pink-500', category: 'social' },
  'facebook': { label: 'Facebook', icon: Globe, color: 'text-blue-600', category: 'social' },
  'tiktok': { label: 'TikTok', icon: Music, color: 'text-gray-900 dark:text-white', category: 'social' },
  'youtube': { label: 'YouTube', icon: VideoIcon, color: 'text-red-500', category: 'social' },
  'pinterest': { label: 'Pinterest', icon: Image, color: 'text-red-600', category: 'social' },
  'reddit': { label: 'Reddit', icon: MessageCircle, color: 'text-orange-500', category: 'social' },
  'twitch': { label: 'Twitch', icon: VideoIcon, color: 'text-purple-500', category: 'social' },
  'medium': { label: 'Medium', icon: BookOpen, color: 'text-gray-800 dark:text-gray-200', category: 'social' },
  'devto': { label: 'dev.to', icon: Code, color: 'text-gray-800 dark:text-white', category: 'social' },
  'hashnode': { label: 'Hashnode', icon: BookOpen, color: 'text-blue-500', category: 'social' },
  'substack': { label: 'Substack', icon: Mail, color: 'text-orange-500', category: 'social' },
  'bluesky': { label: 'Bluesky', icon: Globe, color: 'text-blue-400', category: 'social' },
  'mastodon': { label: 'Mastodon', icon: Globe, color: 'text-blue-500', category: 'social' },
  'snapchat': { label: 'Snapchat', icon: Smile, color: 'text-yellow-400', category: 'social' },
  'notion': { label: 'Notion', icon: FileText, color: 'text-gray-800 dark:text-gray-200', category: 'productivity' },
  'asana': { label: 'Asana', icon: Layers, color: 'text-red-500', category: 'productivity' },
  'trello': { label: 'Trello', icon: Layers, color: 'text-blue-400', category: 'productivity' },
  'jira': { label: 'Jira', icon: Layers, color: 'text-blue-500', category: 'productivity' },
  'linear': { label: 'Linear', icon: Zap, color: 'text-purple-500', category: 'productivity' },
  'clickup': { label: 'ClickUp', icon: Layers, color: 'text-purple-500', category: 'productivity' },
  'monday': { label: 'Monday.com', icon: Layers, color: 'text-yellow-500', category: 'productivity' },
  'wrike': { label: 'Wrike', icon: Layers, color: 'text-blue-500', category: 'productivity' },
  'todoist': { label: 'Todoist', icon: CheckCircle2, color: 'text-red-500', category: 'productivity' },
  'airtable': { label: 'Airtable', icon: Database, color: 'text-green-500', category: 'productivity' },
  'coda': { label: 'Coda', icon: FileText, color: 'text-purple-400', category: 'productivity' },
  'confluence': { label: 'Confluence', icon: BookOpen, color: 'text-blue-400', category: 'productivity' },
  'shopify': { label: 'Shopify', icon: ShoppingCart, color: 'text-green-600', category: 'ecommerce' },
  'woocommerce': { label: 'WooCommerce', icon: ShoppingCart, color: 'text-purple-500', category: 'ecommerce' },
  'magento': { label: 'Magento', icon: ShoppingCart, color: 'text-orange-500', category: 'ecommerce' },
  'stripe': { label: 'Stripe', icon: CreditCard, color: 'text-blue-500', category: 'ecommerce' },
  'paypal': { label: 'PayPal', icon: CreditCard, color: 'text-blue-400', category: 'ecommerce' },
  'square': { label: 'Square', icon: CreditCard, color: 'text-gray-800 dark:text-white', category: 'ecommerce' },
  'squarespace': { label: 'Squarespace', icon: Globe, color: 'text-gray-800 dark:text-white', category: 'ecommerce' },
  'wix': { label: 'Wix', icon: Globe, color: 'text-gray-800 dark:text-white', category: 'ecommerce' },
  'webflow': { label: 'Webflow', icon: Globe, color: 'text-blue-500', category: 'ecommerce' },
  'aws': { label: 'AWS', icon: Cloud, color: 'text-orange-400', category: 'cloud' },
  'digitalocean': { label: 'DigitalOcean', icon: Cloud, color: 'text-blue-400', category: 'cloud' },
  'heroku': { label: 'Heroku', icon: Cloud, color: 'text-purple-500', category: 'cloud' },
  'vercel': { label: 'Vercel', icon: Zap, color: 'text-gray-900 dark:text-white', category: 'cloud' },
  'netlify': { label: 'Netlify', icon: Globe, color: 'text-teal-500', category: 'cloud' },
  'cloudflare': { label: 'Cloudflare', icon: Cloud, color: 'text-orange-500', category: 'cloud' },
  'datadog': { label: 'Datadog', icon: Activity, color: 'text-purple-500', category: 'cloud' },
  'sentry': { label: 'Sentry', icon: AlertTriangle, color: 'text-red-500', category: 'cloud' },
  'hubspot': { label: 'HubSpot', icon: Plug, color: 'text-orange-400', category: 'crm' },
  'salesforce': { label: 'Salesforce', icon: Cloud, color: 'text-blue-500', category: 'crm' },
  'zoho': { label: 'Zoho', icon: Globe, color: 'text-green-500', category: 'crm' },
  'pipedrive': { label: 'Pipedrive', icon: Users, color: 'text-green-600', category: 'crm' },
  'zendesk': { label: 'Zendesk', icon: Headphones, color: 'text-green-500', category: 'support' },
  'freshdesk': { label: 'Freshdesk', icon: Headphones, color: 'text-green-500', category: 'support' },
  'intercom': { label: 'Intercom', icon: MessageCircle, color: 'text-blue-400', category: 'support' },
  'helpscout': { label: 'Help Scout', icon: MessageCircle, color: 'text-green-500', category: 'support' },
  'drift': { label: 'Drift', icon: MessageCircle, color: 'text-blue-500', category: 'support' },
  'front': { label: 'Front', icon: Mail, color: 'text-blue-500', category: 'support' },
  'mailchimp': { label: 'Mailchimp', icon: Send, color: 'text-yellow-500', category: 'email' },
  'sendgrid': { label: 'SendGrid', icon: Send, color: 'text-blue-500', category: 'email' },
  'mailgun': { label: 'Mailgun', icon: Send, color: 'text-red-500', category: 'email' },
  'postmark': { label: 'Postmark', icon: Send, color: 'text-orange-500', category: 'email' },
  'sendinblue': { label: 'SendinBlue', icon: Send, color: 'text-blue-400', category: 'email' },
  'activecampaign': { label: 'ActiveCampaign', icon: Send, color: 'text-blue-500', category: 'email' },
  'twilio': { label: 'Twilio', icon: Phone, color: 'text-red-500', category: 'telephony' },
  'vonage': { label: 'Vonage', icon: Phone, color: 'text-gray-800 dark:text-white', category: 'telephony' },
  'openai': { label: 'OpenAI', icon: Brain, color: 'text-green-500', category: 'ai' },
  'anthropic': { label: 'Anthropic', icon: Brain, color: 'text-orange-500', category: 'ai' },
  'huggingface': { label: 'Hugging Face', icon: Brain, color: 'text-yellow-500', category: 'ai' },
  'cohere': { label: 'Cohere', icon: Brain, color: 'text-blue-500', category: 'ai' },
  'replicate': { label: 'Replicate', icon: Brain, color: 'text-blue-600', category: 'ai' },
  'stability_ai': { label: 'Stability AI', icon: Image, color: 'text-purple-500', category: 'ai' },
  'deepgram': { label: 'Deepgram', icon: Headphones, color: 'text-green-500', category: 'ai' },
  'assemblyai': { label: 'AssemblyAI', icon: Headphones, color: 'text-purple-500', category: 'ai' },
  'elevenlabs': { label: 'ElevenLabs', icon: Headphones, color: 'text-gray-800 dark:text-white', category: 'ai' },
  'openrouter': { label: 'OpenRouter', icon: Zap, color: 'text-blue-500', category: 'ai' },
  'perplexity': { label: 'Perplexity', icon: Brain, color: 'text-gray-800 dark:text-white', category: 'ai' },
  'groq': { label: 'Groq', icon: Zap, color: 'text-orange-500', category: 'ai' },
  'supabase': { label: 'Supabase', icon: Database, color: 'text-green-500', category: 'database' },
  'firebase': { label: 'Firebase', icon: Database, color: 'text-yellow-500', category: 'database' },
  'neon': { label: 'Neon', icon: Database, color: 'text-green-400', category: 'database' },
  'planetscale': { label: 'PlanetScale', icon: Database, color: 'text-blue-500', category: 'database' },
  'mongodb_atlas': { label: 'MongoDB Atlas', icon: Database, color: 'text-green-600', category: 'database' },
  'redis_cloud': { label: 'Redis Cloud', icon: Database, color: 'text-red-500', category: 'database' },
  'upstash': { label: 'Upstash', icon: Zap, color: 'text-green-500', category: 'database' },
  'docker': { label: 'Docker', icon: Terminal, color: 'text-blue-500', category: 'devops' },
  'kubernetes': { label: 'Kubernetes', icon: Monitor, color: 'text-blue-500', category: 'devops' },
  'terraform': { label: 'Terraform', icon: Layers, color: 'text-purple-500', category: 'devops' },
  'jenkins': { label: 'Jenkins', icon: Terminal, color: 'text-red-500', category: 'devops' },
  'circleci': { label: 'CircleCI', icon: Zap, color: 'text-green-500', category: 'devops' },
  'github_actions': { label: 'GitHub Actions', icon: Github, color: 'text-gray-900 dark:text-white', category: 'devops' },
  'figma': { label: 'Figma', icon: Palette, color: 'text-purple-500', category: 'design' },
  'canva': { label: 'Canva', icon: Palette, color: 'text-blue-400', category: 'design' },
  'adobe_creative_cloud': { label: 'Adobe CC', icon: Image, color: 'text-red-500', category: 'design' },
  'spotify': { label: 'Spotify', icon: Music, color: 'text-green-500', category: 'media' },
  'apple_music': { label: 'Apple Music', icon: Music, color: 'text-red-500', category: 'media' },
  'soundcloud': { label: 'SoundCloud', icon: Music, color: 'text-orange-500', category: 'media' },
  'dropbox': { label: 'Dropbox', icon: FolderOpen, color: 'text-blue-400', category: 'storage' },
  'box': { label: 'Box', icon: FolderOpen, color: 'text-blue-500', category: 'storage' },
  'icloud': { label: 'iCloud', icon: Cloud, color: 'text-blue-400', category: 'storage' },
  'auth0': { label: 'Auth0', icon: Shield, color: 'text-orange-500', category: 'auth' },
  'okta': { label: 'Okta', icon: Shield, color: 'text-blue-500', category: 'auth' },
  'clerk': { label: 'Clerk', icon: Shield, color: 'text-purple-500', category: 'auth' },
  'cloudinary': { label: 'Cloudinary', icon: Image, color: 'text-blue-400', category: 'object_storage' },
  'resend': { label: 'Resend', icon: Send, color: 'text-gray-800 dark:text-white', category: 'email_tx' },
  'calendly': { label: 'Calendly', icon: Bell, color: 'text-blue-500', category: 'calendar' },
  'calcom': { label: 'Cal.com', icon: Bell, color: 'text-gray-800 dark:text-white', category: 'calendar' },
  'typeform': { label: 'Typeform', icon: FileText, color: 'text-blue-500', category: 'forms' },
  'hotjar': { label: 'Hotjar', icon: BarChart3, color: 'text-red-500', category: 'analytics' },
  'mixpanel': { label: 'Mixpanel', icon: BarChart3, color: 'text-purple-500', category: 'analytics' },
  'plausible': { label: 'Plausible', icon: BarChart3, color: 'text-gray-800 dark:text-white', category: 'analytics' },
  'algolia': { label: 'Algolia', icon: Search, color: 'text-blue-500', category: 'search' },
  'meilisearch': { label: 'Meilisearch', icon: Search, color: 'text-orange-500', category: 'search' },
  'mapbox': { label: 'Mapbox', icon: MapPin, color: 'text-gray-900 dark:text-white', category: 'maps' },
  'qstash': { label: 'QStash', icon: Timer, color: 'text-green-500', category: 'queues' },
  'inngest': { label: 'Inngest', icon: Zap, color: 'text-purple-500', category: 'queues' },
  'fly_io': { label: 'Fly.io', icon: Rocket, color: 'text-purple-500', category: 'hosting' },
  'railway': { label: 'Railway', icon: Rocket, color: 'text-red-500', category: 'hosting' },
  'render': { label: 'Render', icon: Rocket, color: 'text-blue-500', category: 'hosting' },
  'puppeteer': { label: 'Puppeteer', icon: Terminal, color: 'text-green-500', category: 'devtools' },
  'playwright': { label: 'Playwright', icon: Terminal, color: 'text-green-600', category: 'devtools' },
  'dalle': { label: 'DALL-E', icon: Image, color: 'text-green-500', category: 'image_gen' },
  'stable_diffusion': { label: 'Stable Diffusion', icon: Image, color: 'text-blue-500', category: 'image_gen' },
  'midjourney': { label: 'Midjourney', icon: Image, color: 'text-purple-500', category: 'image_gen' },
  'synthesia': { label: 'Synthesia', icon: VideoIcon, color: 'text-blue-500', category: 'video_gen' },
  'heygen': { label: 'HeyGen', icon: VideoIcon, color: 'text-purple-500', category: 'video_gen' },
  'runwayml': { label: 'RunwayML', icon: VideoIcon, color: 'text-green-500', category: 'video_gen' },
  'd_id': { label: 'D-ID', icon: VideoIcon, color: 'text-blue-400', category: 'video_gen' },
  'elevenlabs_tts': { label: 'ElevenLabs TTS', icon: Headphones, color: 'text-gray-800 dark:text-white', category: 'tts' },
  'google_tts': { label: 'Google TTS', icon: Headphones, color: 'text-blue-500', category: 'tts' },
  'amazon_polly': { label: 'Amazon Polly', icon: Headphones, color: 'text-orange-400', category: 'tts' },
  'azure_tts': { label: 'Azure TTS', icon: Headphones, color: 'text-blue-500', category: 'tts' },
  'cartesia': { label: 'Cartesia', icon: Headphones, color: 'text-purple-500', category: 'tts' },
};

function VideoIcon(props: React.SVGProps<SVGSVGElement>) {
  return <Film {...props} />;
}

function AlertTriangle(props: React.SVGProps<SVGSVGElement>) {
  return <Bell {...props} />;
}

export default function WorkflowAuthorizations() {
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 30;

  useEffect(() => {
    loadAuthorizations();
  }, []);

  const loadAuthorizations = async () => {
    try {
      const res = await fetch('/api/authorizations');
      if (!res.ok) throw new Error('Erreur chargement');
      const data = await res.json();
      setAuthorizations(data.authorizations || []);
    } catch {
      toast.error('Impossible de charger les autorisations');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (service: string, accountId: string) => {
    if (!confirm('Voulez-vous vraiment deconnecter ce compte ?')) return;
    setDeletingId(service + accountId);
    try {
      const res = await fetch(`/api/authorizations?service=${service}&accountId=${accountId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur deconnexion');
      toast.success('Compte deconnecte avec succes');
      await loadAuthorizations();
    } catch {
      toast.error('Impossible de deconnecter le compte');
    } finally {
      setDeletingId(null);
    }
  };

  const handleConnect = async (service: string) => {
    setConnecting(service);
    try {
      toast.info(`Redirection vers ${SERVICES[service]?.label || service} pour autorisation...`);
      await new Promise((r) => setTimeout(r, 1500));
      const mockAuth: Authorization = {
        id: crypto.randomUUID(),
        service,
        accountId: `user_${Date.now()}`,
        accountName: `Mon compte ${SERVICES[service]?.label || service}`,
        scopes: ['read', 'write'],
        isActive: true,
        lastUsedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      const res = await fetch('/api/authorizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: mockAuth.service,
          accessToken: 'mock_token_' + Date.now(),
          accountId: mockAuth.accountId,
          accountName: mockAuth.accountName,
          scopes: mockAuth.scopes,
        }),
      });
      if (!res.ok) throw new Error('Erreur de connexion');
      toast.success(`${SERVICES[service]?.label || service} connecte avec succes !`);
      await loadAuthorizations();
    } catch {
      toast.error('Impossible de connecter le service');
    } finally {
      setConnecting(null);
    }
  };

  const connectedServices = useMemo(
    () => new Set(authorizations.filter((a) => a.isActive).map((a) => a.service)),
    [authorizations]
  );

  const serviceEntries = useMemo(() => {
    const entries = Object.entries(SERVICES).filter(([key]) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        key.includes(s) ||
        SERVICES[key]?.label.toLowerCase().includes(s) ||
        CATEGORIES[SERVICES[key]?.category]?.label.toLowerCase().includes(s)
      );
    });
    return entries;
  }, [search]);

  const groupedServices = useMemo(() => {
    const groups: Record<string, Array<[string, ServiceDef]>> = {};
    serviceEntries.forEach((entry) => {
      const cat = entry[1].category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(entry);
    });
    return groups;
  }, [serviceEntries]);

  const toggleSection = (cat: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const renderServiceCard = (key: string, config: ServiceDef) => {
    const connected = connectedServices.has(key);
    const Icon = config.icon;
    const auth = authorizations.find((a) => a.service === key);

    return (
      <Card
        key={key}
        className={`transition-all duration-200 ${
          connected ? 'border-green-500/30 bg-green-500/5' : 'hover:border-primary/50'
        }`}
      >
        <CardContent className='p-3'>
          <div className='flex items-center justify-between mb-2'>
            <div className='flex items-center gap-2 min-w-0'>
              <div className={`p-1.5 rounded-lg bg-background border shrink-0 ${config.color}`}>
                <Icon className='h-4 w-4' />
              </div>
              <span className='text-sm font-medium truncate'>{config.label}</span>
            </div>
            {connected && <CheckCircle2 className='h-4 w-4 text-green-500 shrink-0' />}
          </div>
          {connected ? (
            <div className='flex gap-1 mt-1'>
              <Button
                variant='outline'
                size='sm'
                className='flex-1 h-7 text-xs'
                onClick={() => handleConnect(key)}
                disabled={connecting === key}
              >
                {connecting === key ? <Loader2 className='h-3 w-3 animate-spin' /> : <RefreshCw className='h-3 w-3' />}
              </Button>
              <Button
                variant='destructive'
                size='sm'
                className='flex-1 h-7 text-xs'
                onClick={() => handleDisconnect(key, auth?.accountId || '')}
                disabled={deletingId === key + (auth?.accountId || '')}
              >
                {deletingId === key + (auth?.accountId || '') ? (
                  <Loader2 className='h-3 w-3 animate-spin' />
                ) : (
                  <Trash2 className='h-3 w-3' />
                )}
              </Button>
            </div>
          ) : (
            <Button
              variant='default'
              size='sm'
              className='w-full h-7 text-xs'
              onClick={() => handleConnect(key)}
              disabled={connecting === key}
            >
              {connecting === key ? (
                <Loader2 className='h-3 w-3 mr-1 animate-spin' />
              ) : (
                <Plug className='h-3 w-3 mr-1' />
              )}
              Connecter
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-10 w-full rounded-lg' />
        <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'>
          {[...Array(20)].map((_, i) => (
            <Skeleton key={i} className='h-24 w-full rounded-xl' />
          ))}
        </div>
      </div>
    );
  }

  const totalCount = Object.keys(SERVICES).length;

  return (
    <div className='space-y-6'>
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>
            Connexions &amp; Autorisations
          </h2>
          <p className='text-sm text-muted-foreground'>
            {totalCount} services disponibles · {authorizations.length} connecte{authorizations.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className='relative'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
        <Input
          placeholder='Rechercher un service parmi ' + totalCount + '...'
          className='pl-9'
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setCurrentPage(1); }}>
        <ScrollArea className='w-full pb-2'>
          <TabsList className='inline-flex h-10'>
            <TabsTrigger value='all' className='text-xs'>
              Tous ({totalCount})
            </TabsTrigger>
            <TabsTrigger value='connected' className='text-xs'>
              Connectes ({authorizations.length})
            </TabsTrigger>
            {Object.entries(CATEGORIES).map(([key, cat]) => (
              <TabsTrigger key={key} value={key} className='text-xs'>
                <cat.icon className='h-3 w-3 mr-1' />
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>

        <TabsContent value='all' className='mt-4'>
          {search ? (
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'>
              {serviceEntries.slice(0, ITEMS_PER_PAGE * currentPage).map(([key, config]) =>
                renderServiceCard(key, config)
              )}
            </div>
          ) : (
            <div className='space-y-4'>
              {Object.entries(groupedServices).map(([cat, services]) => {
                const catInfo = CATEGORIES[cat];
                const CatIcon = catInfo?.icon || Plug;
                const isExpanded = expandedSections.has(cat);
                const toShow = isExpanded ? services : services.slice(0, 6);
                const hasMore = services.length > 6;

                return (
                  <div key={cat} className='space-y-2'>
                    <button
                      onClick={() => toggleSection(cat)}
                      className='flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors'
                    >
                      <CatIcon className='h-4 w-4' />
                      {catInfo?.label || cat}
                      <span className='text-xs text-muted-foreground'>({services.length})</span>
                      {hasMore && (isExpanded ? <ChevronUp className='h-3 w-3' /> : <ChevronDown className='h-3 w-3' />)}
                    </button>
                    <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'>
                      {toShow.map(([key, config]) => renderServiceCard(key, config))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {search && serviceEntries.length > ITEMS_PER_PAGE * currentPage && (
            <div className='flex justify-center mt-6'>
              <Button variant='outline' onClick={() => setCurrentPage((p) => p + 1)}>
                Voir plus ({serviceEntries.length - ITEMS_PER_PAGE * currentPage} restants)
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value='connected' className='mt-4'>
          {authorizations.length === 0 ? (
            <p className='text-center text-muted-foreground py-8 text-sm'>
              Aucun service connecte. Parcours la liste et connecte tes premiers services !
            </p>
          ) : (
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'>
              {authorizations.map((auth) => {
                const config = SERVICES[auth.service];
                if (!config) return null;
                const Icon = config.icon;
                return (
                  <Card key={auth.id} className='border-green-500/30 bg-green-500/5'>
                    <CardContent className='p-3'>
                      <div className='flex items-center justify-between mb-2'>
                        <div className='flex items-center gap-2 min-w-0'>
                          <div className={`p-1.5 rounded-lg bg-background border shrink-0 ${config.color}`}>
                            <Icon className='h-4 w-4' />
                          </div>
                          <span className='text-sm font-medium truncate'>{config.label}</span>
                        </div>
                        <CheckCircle2 className='h-4 w-4 text-green-500 shrink-0' />
                      </div>
                      <p className='text-[10px] text-muted-foreground truncate mb-2'>{auth.accountName}</p>
                      <Button
                        variant='destructive'
                        size='sm'
                        className='w-full h-7 text-xs'
                        onClick={() => handleDisconnect(auth.service, auth.accountId)}
                        disabled={deletingId === auth.service + auth.accountId}
                      >
                        {deletingId === auth.service + auth.accountId ? (
                          <Loader2 className='h-3 w-3 animate-spin' />
                        ) : (
                          <Trash2 className='h-3 w-3 mr-1' />
                        )}
                        Deconnecter
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {Object.keys(CATEGORIES).map((cat) => (
          <TabsContent key={cat} value={cat} className='mt-4'>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'>
              {Object.entries(SERVICES)
                .filter(([, config]) => config.category === cat)
                .slice(0, ITEMS_PER_PAGE * currentPage)
                .map(([key, config]) => renderServiceCard(key, config))}
            </div>
            {Object.keys(SERVICES).filter((k) => SERVICES[k].category === cat).length > ITEMS_PER_PAGE * currentPage && (
              <div className='flex justify-center mt-6'>
                <Button variant='outline' onClick={() => setCurrentPage((p) => p + 1)}>
                  Voir plus
                </Button>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
