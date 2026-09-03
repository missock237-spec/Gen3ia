"""Types générés automatiquement depuis le schéma Prisma GEN3IA (v3.6).

Ne pas éditer à la main — régénérer via : node scripts/gen-sdk-types.mjs
Champs publics de l'API v1 uniquement (aucun secret n'est typé).
"""
from dataclasses import dataclass, field
from typing import Any


@dataclass
class User:
    id: str
    email: str
    role: str
    plan: str
    credits: float
    created_at: str
    updated_at: str
    name: str | None = None
    avatar_url: str | None = None

@dataclass
class Session:
    id: str
    user_id: str
    expires_at: str
    created_at: str
    user_agent: str | None = None
    ip: str | None = None

@dataclass
class Agent:
    id: str
    user_id: str
    name: str
    slug: str
    provider: str
    model: str
    temperature: float
    max_tokens: int
    status: str
    visibility: str
    created_at: str
    updated_at: str
    description: str | None = None
    category: str | None = None

@dataclass
class ApiKey:
    id: str
    user_id: str
    name: str
    prefix: str
    scopes: str
    created_at: str
    last_used_at: str | None = None

@dataclass
class Task:
    id: str
    user_id: str
    prompt: str
    status: str
    cost_credits: float
    tokens_in: int
    tokens_out: int
    attempts: int
    total_retries: int
    created_at: str
    updated_at: str
    agent_id: str | None = None
    selected_plan_id: str | None = None
    error: str | None = None
    started_at: str | None = None
    completed_at: str | None = None

@dataclass
class TaskStep:
    id: str
    task_id: str
    phase: str
    step_index: int
    title: str
    status: str
    created_at: str
    detail: str | None = None
    started_at: str | None = None
    finished_at: str | None = None

@dataclass
class Transaction:
    id: str
    user_id: str
    type: str
    amount: float
    balance_after: float
    created_at: str

@dataclass
class Payment:
    id: str
    user_id: str
    provider: str
    amount: float
    currency: str
    credits: float
    status: str
    created_at: str
    updated_at: str
    checkout_id: str | None = None
    plan: str | None = None
    raw: str | None = None

@dataclass
class Document:
    id: str
    user_id: str
    title: str
    source_type: str
    size: int
    created_at: str
    agent_id: str | None = None

@dataclass
class Memory:
    id: str
    user_id: str
    layer: str
    content: str
    importance: float
    created_at: str
    agent_id: str | None = None
    metadata: str | None = None
    expires_at: str | None = None

@dataclass
class Skill:
    id: str
    name: str
    description: str
    category: str
    created_at: str
    user_id: str | None = None

@dataclass
class Tool:
    id: str
    name: str
    description: str
    category: str
    is_built_in: bool
    enabled: bool
    created_at: str
    user_id: str | None = None
    parameters: str | None = None

@dataclass
class MarketplaceReview:
    id: str
    agent_id: str
    user_id: str
    rating: int
    created_at: str
    comment: str | None = None

@dataclass
class AuditLog:
    id: str
    action: str
    created_at: str
    user_id: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    detail: str | None = None
    ip: str | None = None

@dataclass
class Embedding:
    id: str
    user_id: str
    document_id: str
    chunk_index: int
    chunk_text: str
    embedding: str
    dim: int
    norm: float
    model: str
    created_at: str

@dataclass
class PlanCache:
    id: str
    user_id: str
    prompt_hash: str
    prompt: str
    plans: str
    plan_scores: str
    selected_plan_id: str
    hit_count: int
    last_used_at: str
    expires_at: str
    created_at: str
    embedding: str | None = None

@dataclass
class EngineRun:
    id: str
    engine: str
    ok: bool
    duration_ms: int
    attempts: int
    tokens_in: int
    tokens_out: int
    credits: float
    created_at: str
    task_id: str | None = None
    user_id: str | None = None
    phase: str | None = None
    error_code: str | None = None
    detail: str | None = None

@dataclass
class SystemConfig:
    value: str
    updated_at: str

@dataclass
class TaskArtifact:
    id: str
    task_id: str
    kind: str
    payload: str
    bytes: int
    created_at: str
    phase: str | None = None
    step_index: int | None = None

@dataclass
class ConnectedAccount:
    id: str
    user_id: str
    app_slug: str
    status: str
    auth_scheme: str
    created_at: str
    updated_at: str
    meta: str | None = None
    last_error: str | None = None
    last_refresh_at: str | None = None

@dataclass
class ConnectionRequest:
    id: str
    user_id: str
    app_slug: str
    status: str
    state: str
    created_at: str
    expires_at: str
    redirect_uri: str | None = None

@dataclass
class SwarmSession:
    id: str
    user_id: str
    strategy: str
    status: str
    prompt: str
    tokens_in: int
    tokens_out: int
    cost_credits: float
    created_at: str
    updated_at: str
    sub_tasks: object
    shared_memories: object
    messages: object
    task_id: str | None = None
    plan: str | None = None
    result: str | None = None

@dataclass
class SubTask:
    id: str
    session_id: str
    title: str
    description: str
    assigned_agent: str
    status: str
    created_at: str
    updated_at: str
    dependencies: str | None = None
    input: str | None = None
    result: str | None = None
    error: str | None = None
    started_at: str | None = None
    finished_at: str | None = None

@dataclass
class SharedMemory:
    id: str
    value: str
    author: str
    namespace: str
    version: int
    created_at: str
    updated_at: str
    session_id: str | None = None
    user_id: str | None = None

@dataclass
class SwarmMessage:
    id: str
    session_id: str
    channel: str
    sender_id: str
    content: str
    created_at: str
    payload: str | None = None

@dataclass
class TaskPriority:
    id: str
    task_id: str
    cost: float
    speed: float
    accuracy: float
    created_at: str
    updated_at: str

@dataclass
class ExplorationRun:
    id: str
    task_id: str
    variant_count: int
    winner_plan_id: str
    results: str
    status: str
    created_at: str
    updated_at: str

@dataclass
class FineTuneJob:
    id: str
    user_id: str
    name: str
    status: str
    dataset_size: int
    base_model: str
    engine: str
    created_at: str
    updated_at: str
    dataset_path: str | None = None
    config: str | None = None
    metrics: str | None = None
    error: str | None = None
    started_at: str | None = None
    finished_at: str | None = None

@dataclass
class AutoSkill:
    id: str
    user_id: str
    pattern: str
    code: str
    language: str
    status: str
    usage_count: int
    success_rate: float
    created_at: str
    updated_at: str

@dataclass
class UserProfile:
    id: str
    user_id: str
    response_style: str
    tone: str
    language: str
    detail_level: float
    interaction_count: int
    created_at: str
    updated_at: str
    preferences: str | None = None

@dataclass
class ImmutableAuditLog:
    id: str
    entry_hash: str
    action: str
    created_at: str
    user_id: str | None = None
    prev_hash: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    detail: str | None = None
    ip: str | None = None

@dataclass
class AnomalyAlert:
    id: str
    type: str
    severity: str
    message: str
    action: str
    resolved: bool
    created_at: str
    user_id: str | None = None
    metric: str | None = None
    threshold: float | None = None
    actual_value: float | None = None

@dataclass
class Trace:
    id: str
    trace_id: str
    status: str
    duration_ms: int
    spans: int
    created_at: str
    span_list: object
    task_id: str | None = None
    user_id: str | None = None
    root_span_id: str | None = None

@dataclass
class TraceSpan:
    id: str
    trace_id: str
    span_id: str
    name: str
    start_time: float
    duration_ms: int
    status: str
    created_at: str
    parent_span_id: str | None = None
    end_time: float | None = None
    attributes: str | None = None
    events: str | None = None

@dataclass
class BatchTask:
    id: str
    user_id: str
    status: str
    total: int
    completed: int
    failed: int
    created_at: str
    updated_at: str
    items: object
    name: str | None = None
    results: str | None = None

@dataclass
class BatchItem:
    id: str
    batch_id: str
    prompt: str
    status: str
    created_at: str
    updated_at: str
    task_id: str | None = None
    result: str | None = None
    error: str | None = None

@dataclass
class AgentListing:
    id: str
    agent_id: str
    price: float
    currency: str
    commission: float
    downloads: int
    purchases: int
    revenue: float
    created_at: str
    updated_at: str
    description: str | None = None
    tags: str | None = None

@dataclass
class Purchase:
    id: str
    buyer_id: str
    seller_id: str
    agent_id: str
    listing_id: str
    amount: float
    commission: float
    payout: float
    status: str
    created_at: str

@dataclass
class WebhookConfig:
    id: str
    user_id: str
    url: str
    events: str
    active: bool
    created_at: str
    updated_at: str
    deliveries: object
    agent_id: str | None = None
    task_id: str | None = None

@dataclass
class WebhookDelivery:
    id: str
    webhook_id: str
    event: str
    payload: str
    attempt: int
    created_at: str
    status_code: int | None = None
    response: str | None = None
    error: str | None = None
    delivered_at: str | None = None

@dataclass
class ExternalConnection:
    id: str
    user_id: str
    type: str
    name: str
    config: str
    active: bool
    created_at: str
    updated_at: str

@dataclass
class WatchConfig:
    id: str
    user_id: str
    name: str
    type: str
    target: str
    schedule: str
    alert_channel: str
    active: bool
    created_at: str
    updated_at: str
    executions: object
    condition: str | None = None
    alert_target: str | None = None
    last_value: str | None = None
    last_check_at: str | None = None

@dataclass
class WatchExecution:
    id: str
    watch_id: str
    triggered: bool
    alert_sent: bool
    executed_at: str
    value: str | None = None
    error: str | None = None

@dataclass
class OAuthIdentity:
    id: str
    user_id: str
    provider: str
    provider_account_id: str
    created_at: str
    email: str | None = None
    name: str | None = None
    avatar_url: str | None = None

@dataclass
class OAuthAppConfig:
    id: str
    app_slug: str
    client_id: str
    active: bool
    created_at: str
    updated_at: str
    redirect_uri: str | None = None
    scopes: str | None = None
    extra_config: str | None = None
    created_by: str | None = None

@dataclass
class LiveSession:
    id: str
    code: str
    host_id: str
    status: str
    created_at: str
    title: str | None = None

@dataclass
class LiveParticipant:
    id: str
    session_id: str
    display_name: str
    role: str
    last_seen_at: str
    joined_at: str
    user_id: str | None = None
    left_at: str | None = None

@dataclass
class LiveSignal:
    id: str
    session_id: str
    from_id: str
    type: str
    payload: str
    created_at: str
    to_id: str | None = None
    consumed_at: str | None = None

@dataclass
class AdWallet:
    id: str
    user_id: str
    balance: float
    created_at: str
    updated_at: str
    transactions: object

@dataclass
class AdTransaction:
    id: str
    wallet_id: str
    type: str
    amount: float
    balance_after: float
    description: str
    created_at: str
    payment_id: str | None = None
    campaign_id: str | None = None

@dataclass
class AdCampaign:
    id: str
    user_id: str
    name: str
    platform: str
    objective: str
    status: str
    budget_per_day: float
    total_spent: float
    created_at: str
    updated_at: str
    target_url: str | None = None
    start_date: str | None = None
    end_date: str | None = None

@dataclass
class AdCreative:
    id: str
    campaign_id: str
    headline: str
    body: str
    status: str
    created_at: str
    media_url: str | None = None
    cta: str | None = None

@dataclass
class CrossAgentPattern:
    id: str
    pattern_hash: str
    pattern: str
    category: str
    occurrences: int
    distinct_users: int
    last_seen_at: str
    created_at: str
    tags: str | None = None
    seen_by: str | None = None

