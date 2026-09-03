/** Types générés automatiquement depuis le schéma Prisma GEN3IA (v3.6).
 * Ne pas éditer à la main — régénérer via : node scripts/gen-sdk-types.mjs
 * Champs publics de l'API v1 uniquement (aucun secret n'est typé).
 */

export interface User {
  /** id (identifiant) */
  id: string;
  /** email */
  email: string;
  /** name */
  name?: string | null;
  /** role */
  role: string;
  /** plan */
  plan: string;
  /** credits */
  credits: number;
  /** avatarUrl */
  avatarUrl?: string | null;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface Session {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** userAgent */
  userAgent?: string | null;
  /** ip */
  ip?: string | null;
  /** expiresAt */
  expiresAt: string;
  /** createdAt */
  createdAt: string;
}

export interface Agent {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** name */
  name: string;
  /** slug */
  slug: string;
  /** description */
  description?: string | null;
  /** provider */
  provider: string;
  /** model */
  model: string;
  /** temperature */
  temperature: number;
  /** maxTokens */
  maxTokens: number;
  /** status */
  status: string;
  /** visibility */
  visibility: string;
  /** category */
  category?: string | null;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface ApiKey {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** name */
  name: string;
  /** prefix */
  prefix: string;
  /** scopes */
  scopes: string;
  /** lastUsedAt */
  lastUsedAt?: string | null;
  /** createdAt */
  createdAt: string;
}

export interface Task {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** agentId */
  agentId?: string | null;
  /** prompt */
  prompt: string;
  /** status */
  status: string;
  /** selectedPlanId */
  selectedPlanId?: string | null;
  /** costCredits */
  costCredits: number;
  /** tokensIn */
  tokensIn: number;
  /** tokensOut */
  tokensOut: number;
  /** attempts */
  attempts: number;
  /** totalRetries */
  totalRetries: number;
  /** error */
  error?: string | null;
  /** startedAt */
  startedAt?: string | null;
  /** completedAt */
  completedAt?: string | null;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface TaskStep {
  /** id (identifiant) */
  id: string;
  /** taskId */
  taskId: string;
  /** phase */
  phase: string;
  /** stepIndex */
  stepIndex: number;
  /** title */
  title: string;
  /** detail */
  detail?: string | null;
  /** status */
  status: string;
  /** startedAt */
  startedAt?: string | null;
  /** finishedAt */
  finishedAt?: string | null;
  /** createdAt */
  createdAt: string;
}

export interface Transaction {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** type */
  type: string;
  /** amount */
  amount: number;
  /** balanceAfter */
  balanceAfter: number;
  /** createdAt */
  createdAt: string;
}

export interface Payment {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** provider */
  provider: string;
  /** checkoutId */
  checkoutId?: string | null;
  /** plan */
  plan?: string | null;
  /** amount */
  amount: number;
  /** currency */
  currency: string;
  /** credits */
  credits: number;
  /** status */
  status: string;
  /** raw */
  raw?: string | null;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface Document {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** agentId */
  agentId?: string | null;
  /** title */
  title: string;
  /** sourceType */
  sourceType: string;
  /** size */
  size: number;
  /** createdAt */
  createdAt: string;
}

export interface Memory {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** agentId */
  agentId?: string | null;
  /** layer */
  layer: string;
  /** content */
  content: string;
  /** importance */
  importance: number;
  /** metadata */
  metadata?: string | null;
  /** expiresAt */
  expiresAt?: string | null;
  /** createdAt */
  createdAt: string;
}

export interface Skill {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId?: string | null;
  /** name */
  name: string;
  /** description */
  description: string;
  /** category */
  category: string;
  /** createdAt */
  createdAt: string;
}

export interface Tool {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId?: string | null;
  /** name */
  name: string;
  /** description */
  description: string;
  /** category */
  category: string;
  /** parameters */
  parameters?: string | null;
  /** isBuiltIn */
  isBuiltIn: boolean;
  /** enabled */
  enabled: boolean;
  /** createdAt */
  createdAt: string;
}

export interface MarketplaceReview {
  /** id (identifiant) */
  id: string;
  /** agentId */
  agentId: string;
  /** userId */
  userId: string;
  /** rating */
  rating: number;
  /** comment */
  comment?: string | null;
  /** createdAt */
  createdAt: string;
}

export interface AuditLog {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId?: string | null;
  /** action */
  action: string;
  /** entityType */
  entityType?: string | null;
  /** entityId */
  entityId?: string | null;
  /** detail */
  detail?: string | null;
  /** ip */
  ip?: string | null;
  /** createdAt */
  createdAt: string;
}

export interface Embedding {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** documentId */
  documentId: string;
  /** chunkIndex */
  chunkIndex: number;
  /** chunkText */
  chunkText: string;
  /** embedding */
  embedding: string;
  /** dim */
  dim: number;
  /** norm */
  norm: number;
  /** model */
  model: string;
  /** createdAt */
  createdAt: string;
}

export interface PlanCache {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** promptHash */
  promptHash: string;
  /** prompt */
  prompt: string;
  /** embedding */
  embedding?: string | null;
  /** plans */
  plans: string;
  /** planScores */
  planScores: string;
  /** selectedPlanId */
  selectedPlanId: string;
  /** hitCount */
  hitCount: number;
  /** lastUsedAt */
  lastUsedAt: string;
  /** expiresAt */
  expiresAt: string;
  /** createdAt */
  createdAt: string;
}

export interface EngineRun {
  /** id (identifiant) */
  id: string;
  /** engine */
  engine: string;
  /** taskId */
  taskId?: string | null;
  /** userId */
  userId?: string | null;
  /** phase */
  phase?: string | null;
  /** ok */
  ok: boolean;
  /** errorCode */
  errorCode?: string | null;
  /** durationMs */
  durationMs: number;
  /** attempts */
  attempts: number;
  /** tokensIn */
  tokensIn: number;
  /** tokensOut */
  tokensOut: number;
  /** credits */
  credits: number;
  /** detail */
  detail?: string | null;
  /** createdAt */
  createdAt: string;
}

export interface SystemConfig {
  /** value */
  value: string;
  /** updatedAt */
  updatedAt: string;
}

export interface TaskArtifact {
  /** id (identifiant) */
  id: string;
  /** taskId */
  taskId: string;
  /** kind */
  kind: string;
  /** phase */
  phase?: string | null;
  /** stepIndex */
  stepIndex?: number | null;
  /** payload */
  payload: string;
  /** bytes */
  bytes: number;
  /** createdAt */
  createdAt: string;
}

export interface ConnectedAccount {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** appSlug */
  appSlug: string;
  /** status */
  status: string;
  /** authScheme */
  authScheme: string;
  /** meta */
  meta?: string | null;
  /** lastError */
  lastError?: string | null;
  /** lastRefreshAt */
  lastRefreshAt?: string | null;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface ConnectionRequest {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** appSlug */
  appSlug: string;
  /** status */
  status: string;
  /** redirectUri */
  redirectUri?: string | null;
  /** state */
  state: string;
  /** createdAt */
  createdAt: string;
  /** expiresAt */
  expiresAt: string;
}

export interface SwarmSession {
  /** id (identifiant) */
  id: string;
  /** taskId */
  taskId?: string | null;
  /** userId */
  userId: string;
  /** strategy */
  strategy: string;
  /** status */
  status: string;
  /** prompt */
  prompt: string;
  /** plan */
  plan?: string | null;
  /** result */
  result?: string | null;
  /** tokensIn */
  tokensIn: number;
  /** tokensOut */
  tokensOut: number;
  /** costCredits */
  costCredits: number;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
  /** subTasks */
  subTasks: unknown;
  /** sharedMemories */
  sharedMemories: unknown;
  /** messages */
  messages: unknown;
}

export interface SubTask {
  /** id (identifiant) */
  id: string;
  /** sessionId */
  sessionId: string;
  /** title */
  title: string;
  /** description */
  description: string;
  /** assignedAgent */
  assignedAgent: string;
  /** status */
  status: string;
  /** dependencies */
  dependencies?: string | null;
  /** input */
  input?: string | null;
  /** result */
  result?: string | null;
  /** error */
  error?: string | null;
  /** startedAt */
  startedAt?: string | null;
  /** finishedAt */
  finishedAt?: string | null;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface SharedMemory {
  /** id (identifiant) */
  id: string;
  /** sessionId */
  sessionId?: string | null;
  /** userId */
  userId?: string | null;
  /** value */
  value: string;
  /** author */
  author: string;
  /** namespace */
  namespace: string;
  /** version */
  version: number;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface SwarmMessage {
  /** id (identifiant) */
  id: string;
  /** sessionId */
  sessionId: string;
  /** channel */
  channel: string;
  /** senderId */
  senderId: string;
  /** content */
  content: string;
  /** payload */
  payload?: string | null;
  /** createdAt */
  createdAt: string;
}

export interface TaskPriority {
  /** id (identifiant) */
  id: string;
  /** taskId */
  taskId: string;
  /** cost */
  cost: number;
  /** speed */
  speed: number;
  /** accuracy */
  accuracy: number;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface ExplorationRun {
  /** id (identifiant) */
  id: string;
  /** taskId */
  taskId: string;
  /** variantCount */
  variantCount: number;
  /** winnerPlanId */
  winnerPlanId: string;
  /** results */
  results: string;
  /** status */
  status: string;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface FineTuneJob {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** name */
  name: string;
  /** status */
  status: string;
  /** datasetPath */
  datasetPath?: string | null;
  /** datasetSize */
  datasetSize: number;
  /** baseModel */
  baseModel: string;
  /** engine */
  engine: string;
  /** config */
  config?: string | null;
  /** metrics */
  metrics?: string | null;
  /** error */
  error?: string | null;
  /** startedAt */
  startedAt?: string | null;
  /** finishedAt */
  finishedAt?: string | null;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface AutoSkill {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** pattern */
  pattern: string;
  /** code */
  code: string;
  /** language */
  language: string;
  /** status */
  status: string;
  /** usageCount */
  usageCount: number;
  /** successRate */
  successRate: number;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface UserProfile {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** responseStyle */
  responseStyle: string;
  /** tone */
  tone: string;
  /** language */
  language: string;
  /** detailLevel */
  detailLevel: number;
  /** preferences */
  preferences?: string | null;
  /** interactionCount */
  interactionCount: number;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface ImmutableAuditLog {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId?: string | null;
  /** prevHash */
  prevHash?: string | null;
  /** entryHash */
  entryHash: string;
  /** action */
  action: string;
  /** entityType */
  entityType?: string | null;
  /** entityId */
  entityId?: string | null;
  /** detail */
  detail?: string | null;
  /** ip */
  ip?: string | null;
  /** createdAt */
  createdAt: string;
}

export interface AnomalyAlert {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId?: string | null;
  /** type */
  type: string;
  /** severity */
  severity: string;
  /** message */
  message: string;
  /** metric */
  metric?: string | null;
  /** threshold */
  threshold?: number | null;
  /** actualValue */
  actualValue?: number | null;
  /** action */
  action: string;
  /** resolved */
  resolved: boolean;
  /** createdAt */
  createdAt: string;
}

export interface Trace {
  /** id (identifiant) */
  id: string;
  /** traceId */
  traceId: string;
  /** taskId */
  taskId?: string | null;
  /** userId */
  userId?: string | null;
  /** rootSpanId */
  rootSpanId?: string | null;
  /** status */
  status: string;
  /** durationMs */
  durationMs: number;
  /** spans */
  spans: number;
  /** createdAt */
  createdAt: string;
  /** spanList */
  spanList: unknown;
}

export interface TraceSpan {
  /** id (identifiant) */
  id: string;
  /** traceId */
  traceId: string;
  /** spanId */
  spanId: string;
  /** parentSpanId */
  parentSpanId?: string | null;
  /** name */
  name: string;
  /** startTime */
  startTime: number;
  /** endTime */
  endTime?: number | null;
  /** durationMs */
  durationMs: number;
  /** attributes */
  attributes?: string | null;
  /** status */
  status: string;
  /** events */
  events?: string | null;
  /** createdAt */
  createdAt: string;
}

export interface BatchTask {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** name */
  name?: string | null;
  /** status */
  status: string;
  /** total */
  total: number;
  /** completed */
  completed: number;
  /** failed */
  failed: number;
  /** results */
  results?: string | null;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
  /** items */
  items: unknown;
}

export interface BatchItem {
  /** id (identifiant) */
  id: string;
  /** batchId */
  batchId: string;
  /** taskId */
  taskId?: string | null;
  /** prompt */
  prompt: string;
  /** status */
  status: string;
  /** result */
  result?: string | null;
  /** error */
  error?: string | null;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface AgentListing {
  /** id (identifiant) */
  id: string;
  /** agentId */
  agentId: string;
  /** price */
  price: number;
  /** currency */
  currency: string;
  /** commission */
  commission: number;
  /** description */
  description?: string | null;
  /** tags */
  tags?: string | null;
  /** downloads */
  downloads: number;
  /** purchases */
  purchases: number;
  /** revenue */
  revenue: number;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface Purchase {
  /** id (identifiant) */
  id: string;
  /** buyerId */
  buyerId: string;
  /** sellerId */
  sellerId: string;
  /** agentId */
  agentId: string;
  /** listingId */
  listingId: string;
  /** amount */
  amount: number;
  /** commission */
  commission: number;
  /** payout */
  payout: number;
  /** status */
  status: string;
  /** createdAt */
  createdAt: string;
}

export interface WebhookConfig {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** url */
  url: string;
  /** events */
  events: string;
  /** agentId */
  agentId?: string | null;
  /** taskId */
  taskId?: string | null;
  /** active */
  active: boolean;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
  /** deliveries */
  deliveries: unknown;
}

export interface WebhookDelivery {
  /** id (identifiant) */
  id: string;
  /** webhookId */
  webhookId: string;
  /** event */
  event: string;
  /** payload */
  payload: string;
  /** statusCode */
  statusCode?: number | null;
  /** response */
  response?: string | null;
  /** attempt */
  attempt: number;
  /** error */
  error?: string | null;
  /** deliveredAt */
  deliveredAt?: string | null;
  /** createdAt */
  createdAt: string;
}

export interface ExternalConnection {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** type */
  type: string;
  /** name */
  name: string;
  /** config */
  config: string;
  /** active */
  active: boolean;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface WatchConfig {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** name */
  name: string;
  /** type */
  type: string;
  /** target */
  target: string;
  /** schedule */
  schedule: string;
  /** condition */
  condition?: string | null;
  /** alertChannel */
  alertChannel: string;
  /** alertTarget */
  alertTarget?: string | null;
  /** lastValue */
  lastValue?: string | null;
  /** lastCheckAt */
  lastCheckAt?: string | null;
  /** active */
  active: boolean;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
  /** executions */
  executions: unknown;
}

export interface WatchExecution {
  /** id (identifiant) */
  id: string;
  /** watchId */
  watchId: string;
  /** value */
  value?: string | null;
  /** triggered */
  triggered: boolean;
  /** alertSent */
  alertSent: boolean;
  /** error */
  error?: string | null;
  /** executedAt */
  executedAt: string;
}

export interface OAuthIdentity {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** provider */
  provider: string;
  /** providerAccountId */
  providerAccountId: string;
  /** email */
  email?: string | null;
  /** name */
  name?: string | null;
  /** avatarUrl */
  avatarUrl?: string | null;
  /** createdAt */
  createdAt: string;
}

export interface OAuthAppConfig {
  /** id (identifiant) */
  id: string;
  /** appSlug */
  appSlug: string;
  /** clientId */
  clientId: string;
  /** redirectUri */
  redirectUri?: string | null;
  /** scopes */
  scopes?: string | null;
  /** extraConfig */
  extraConfig?: string | null;
  /** active */
  active: boolean;
  /** createdBy */
  createdBy?: string | null;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface LiveSession {
  /** id (identifiant) */
  id: string;
  /** code */
  code: string;
  /** hostId */
  hostId: string;
  /** title */
  title?: string | null;
  /** status */
  status: string;
  /** createdAt */
  createdAt: string;
}

export interface LiveParticipant {
  /** id (identifiant) */
  id: string;
  /** sessionId */
  sessionId: string;
  /** userId */
  userId?: string | null;
  /** displayName */
  displayName: string;
  /** role */
  role: string;
  /** lastSeenAt */
  lastSeenAt: string;
  /** joinedAt */
  joinedAt: string;
  /** leftAt */
  leftAt?: string | null;
}

export interface LiveSignal {
  /** id (identifiant) */
  id: string;
  /** sessionId */
  sessionId: string;
  /** fromId */
  fromId: string;
  /** toId */
  toId?: string | null;
  /** type */
  type: string;
  /** payload */
  payload: string;
  /** createdAt */
  createdAt: string;
  /** consumedAt */
  consumedAt?: string | null;
}

export interface AdWallet {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** balance */
  balance: number;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
  /** transactions */
  transactions: unknown;
}

export interface AdTransaction {
  /** id (identifiant) */
  id: string;
  /** walletId */
  walletId: string;
  /** type */
  type: string;
  /** amount */
  amount: number;
  /** balanceAfter */
  balanceAfter: number;
  /** description */
  description: string;
  /** paymentId */
  paymentId?: string | null;
  /** campaignId */
  campaignId?: string | null;
  /** createdAt */
  createdAt: string;
}

export interface AdCampaign {
  /** id (identifiant) */
  id: string;
  /** userId */
  userId: string;
  /** name */
  name: string;
  /** platform */
  platform: string;
  /** objective */
  objective: string;
  /** status */
  status: string;
  /** budgetPerDay */
  budgetPerDay: number;
  /** totalSpent */
  totalSpent: number;
  /** targetUrl */
  targetUrl?: string | null;
  /** startDate */
  startDate?: string | null;
  /** endDate */
  endDate?: string | null;
  /** createdAt */
  createdAt: string;
  /** updatedAt */
  updatedAt: string;
}

export interface AdCreative {
  /** id (identifiant) */
  id: string;
  /** campaignId */
  campaignId: string;
  /** headline */
  headline: string;
  /** body */
  body: string;
  /** mediaUrl */
  mediaUrl?: string | null;
  /** cta */
  cta?: string | null;
  /** status */
  status: string;
  /** createdAt */
  createdAt: string;
}

export interface CrossAgentPattern {
  /** id (identifiant) */
  id: string;
  /** patternHash */
  patternHash: string;
  /** pattern */
  pattern: string;
  /** category */
  category: string;
  /** tags */
  tags?: string | null;
  /** occurrences */
  occurrences: number;
  /** distinctUsers */
  distinctUsers: number;
  /** seenBy */
  seenBy?: string | null;
  /** lastSeenAt */
  lastSeenAt: string;
  /** createdAt */
  createdAt: string;
}
