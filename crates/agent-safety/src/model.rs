// ============================================================
// Modèles de données pour le moteur de sécurité agent
// ============================================================

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptVerdict {
    pub safe: bool,
    pub reason: String,
    pub risk_score: f64,
    pub flagged_categories: Vec<String>,
    pub token_count: u64,
    pub sanitized_prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolValidationResult {
    pub safe: bool,
    pub allowed_tools: Vec<String>,
    pub blocked_tools: Vec<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceCheckResult {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionSessionStatus {
    pub is_active: bool,
    pub elapsed_ms: u64,
    pub remaining_ms: u64,
    pub max_allowed_ms: u64,
    pub tool_calls_executed: u32,
    pub tokens_consumed: u64,
    pub memory_peak_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimitConfig {
    pub max_memory_bytes: u64,
    pub max_cpu_percent: f64,
    pub max_tokens_per_session: u64,
    pub max_tool_calls_per_session: u32,
}

impl Default for ResourceLimitConfig {
    fn default() -> Self {
        Self {
            max_memory_bytes: 512 * 1024 * 1024,       // 512 MB
            max_cpu_percent: 80.0,                      // 80% CPU
            max_tokens_per_session: 128_000,            // 128k tokens
            max_tool_calls_per_session: 100,            // 100 tool calls max
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionSession {
    pub session_id: String,
    pub agent_id: String,
    pub started_at: i64,
    pub max_execution_ms: u64,
    pub tool_calls_executed: u32,
    pub tokens_consumed: u64,
    pub memory_peak_bytes: u64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RiskCategory {
    PromptInjection,
    Jailbreak,
    SystemPromptLeak,
    SensitiveData,
    CodeExecution,
    UnauthorizedTool,
    ResourceAbuse,
    RepetitivePattern,
    UnstableLoop,
}

impl RiskCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            RiskCategory::PromptInjection => "prompt_injection",
            RiskCategory::Jailbreak => "jailbreak_attempt",
            RiskCategory::SystemPromptLeak => "system_prompt_leak",
            RiskCategory::SensitiveData => "sensitive_data_exposure",
            RiskCategory::CodeExecution => "code_execution_request",
            RiskCategory::UnauthorizedTool => "unauthorized_tool",
            RiskCategory::ResourceAbuse => "resource_abuse",
            RiskCategory::RepetitivePattern => "repetitive_pattern",
            RiskCategory::UnstableLoop => "unstable_loop",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "prompt_injection" => Some(RiskCategory::PromptInjection),
            "jailbreak_attempt" => Some(RiskCategory::Jailbreak),
            "system_prompt_leak" => Some(RiskCategory::SystemPromptLeak),
            "sensitive_data_exposure" => Some(RiskCategory::SensitiveData),
            "code_execution_request" => Some(RiskCategory::CodeExecution),
            "unauthorized_tool" => Some(RiskCategory::UnauthorizedTool),
            "resource_abuse" => Some(RiskCategory::ResourceAbuse),
            "repetitive_pattern" => Some(RiskCategory::RepetitivePattern),
            "unstable_loop" => Some(RiskCategory::UnstableLoop),
            _ => None,
        }
    }
}
