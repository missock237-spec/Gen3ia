// ============================================================
// agent-safety — Moteur Rust de sécurité & performance agents IA
// NAPI bindings pour intégration Next.js
// ============================================================

use napi_derive::napi;
use napi::bindgen_prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;
use tracing::{info, warn, error, debug};

pub mod sandbox;
pub mod resource_limiter;
pub mod prompt_inspector;
pub mod tool_validator;
pub mod execution_tracker;
pub mod model;
pub mod error;

use error::AgentSafetyError;
use model::*;

static ENGINE: LazyLock<SafetyEngineInner> = LazyLock::new(|| {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "agent_safety=info".into()),
        )
        .json()
        .init();
    SafetyEngineInner::new()
});

struct SafetyEngineInner {
    resource_limiter: crate::resource_limiter::ResourceLimiter,
    sandbox: crate::sandbox::Sandbox,
    execution_tracker: crate::execution_tracker::ExecutionTracker,
}

impl SafetyEngineInner {
    fn new() -> Self {
        Self {
            resource_limiter: crate::resource_limiter::ResourceLimiter::new(
                ResourceLimitConfig::default(),
            ),
            sandbox: crate::sandbox::Sandbox::new(),
            execution_tracker: crate::execution_tracker::ExecutionTracker::new(),
        }
    }

    fn validate_prompt(&self, prompt: &str, max_tokens: u64) -> Result<PromptVerdict, AgentSafetyError> {
        let inspector = crate::prompt_inspector::PromptInspector::new(max_tokens);
        inspector.inspect(prompt)
    }

    fn validate_tools(&self, tools: &[String], allowed_list: &[String]) -> Result<ToolValidationResult, AgentSafetyError> {
        crate::tool_validator::validate_tools(tools, allowed_list)
    }

    fn track_execution(&self, agent_id: &str, max_execution_ms: u64) -> Result<String, AgentSafetyError> {
        self.execution_tracker.start_session(agent_id, max_execution_ms)
    }

    fn get_session_status(&self, session_id: &str) -> Result<ExecutionSessionStatus, AgentSafetyError> {
        self.execution_tracker.get_status(session_id)
    }

    fn check_resource_limits(
        &self,
        memory_bytes: u64,
        cpu_percent: f64,
        tokens_used: u64,
        tool_calls: u32,
    ) -> ResourceCheckResult {
        self.resource_limiter.check(memory_bytes, cpu_percent, tokens_used, tool_calls)
    }
}

// ============================================================
// NAPI exports — appelables depuis TypeScript/Next.js
// ============================================================

#[napi(object)]
#[derive(Clone)]
pub struct JsPromptVerdict {
    pub safe: bool,
    pub reason: String,
    pub risk_score: f64,
    pub flagged_categories: Vec<String>,
    pub token_count: u64,
    pub sanitized_prompt: String,
}

#[napi(object)]
#[derive(Clone)]
pub struct JsToolValidation {
    pub safe: bool,
    pub allowed_tools: Vec<String>,
    pub blocked_tools: Vec<String>,
    pub reason: String,
}

#[napi(object)]
#[derive(Clone)]
pub struct JsResourceCheck {
    pub can_proceed: bool,
    pub memory_exceeded: bool,
    pub cpu_exceeded: bool,
    pub tokens_exceeded: bool,
    pub tool_calls_exceeded: bool,
    pub memory_limit_bytes: u64,
    pub cpu_limit_percent: f64,
    pub token_limit: u64,
    pub tool_call_limit: u32,
}

#[napi(object)]
#[derive(Clone)]
pub struct JsExecutionStatus {
    pub is_active: bool,
    pub elapsed_ms: u64,
    pub remaining_ms: u64,
    pub max_allowed_ms: u64,
    pub tool_calls_executed: u32,
    pub tokens_consumed: u64,
    pub memory_peak_bytes: u64,
}

#[napi]
pub fn validate_agent_prompt(prompt: String, max_tokens: u64) -> Result<JsPromptVerdict> {
    let result = ENGINE.validate_prompt(&prompt, max_tokens)
        .map_err(|e| napi::Error::from_reason(format!("Prompt validation failed: {}", e)))?;
    Ok(JsPromptVerdict {
        safe: result.safe,
        reason: result.reason,
        risk_score: result.risk_score,
        flagged_categories: result.flagged_categories,
        token_count: result.token_count,
        sanitized_prompt: result.sanitized_prompt,
    })
}

#[napi]
pub fn validate_agent_tools(tools: Vec<String>, allowed_list: Vec<String>) -> Result<JsToolValidation> {
    let result = ENGINE.validate_tools(&tools, &allowed_list)
        .map_err(|e| napi::Error::from_reason(format!("Tool validation failed: {}", e)))?;
    Ok(JsToolValidation {
        safe: result.safe,
        allowed_tools: result.allowed_tools,
        blocked_tools: result.blocked_tools,
        reason: result.reason,
    })
}

#[napi]
pub fn start_agent_execution_session(agent_id: String, max_execution_ms: u64) -> Result<String> {
    let session_id = ENGINE.track_execution(&agent_id, max_execution_ms)
        .map_err(|e| napi::Error::from_reason(format!("Session start failed: {}", e)))?;
    Ok(session_id)
}

#[napi]
pub fn get_execution_session_status(session_id: String) -> Result<JsExecutionStatus> {
    let status = ENGINE.get_session_status(&session_id)
        .map_err(|e| napi::Error::from_reason(format!("Session status failed: {}", e)))?;
    Ok(JsExecutionStatus {
        is_active: status.is_active,
        elapsed_ms: status.elapsed_ms,
        remaining_ms: status.remaining_ms,
        max_allowed_ms: status.max_allowed_ms,
        tool_calls_executed: status.tool_calls_executed,
        tokens_consumed: status.tokens_consumed,
        memory_peak_bytes: status.memory_peak_bytes,
    })
}

#[napi]
pub fn check_agent_resources(
    memory_bytes: u64,
    cpu_percent: f64,
    tokens_used: u64,
    tool_calls: u32,
) -> JsResourceCheck {
    let result = ENGINE.check_resource_limits(memory_bytes, cpu_percent, tokens_used, tool_calls);
    JsResourceCheck {
        can_proceed: result.can_proceed,
        memory_exceeded: result.memory_exceeded,
        cpu_exceeded: result.cpu_exceeded,
        tokens_exceeded: result.tokens_exceeded,
        tool_calls_exceeded: result.tool_calls_exceeded,
        memory_limit_bytes: result.memory_limit_bytes,
        cpu_limit_percent: result.cpu_limit_percent,
        token_limit: result.token_limit,
        tool_call_limit: result.tool_call_limit,
    }
}

#[napi]
pub fn safety_init() -> bool {
    let _ = &*ENGINE;
    info!("agent-safety engine initialized successfully");
    true
}
