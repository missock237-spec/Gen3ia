// ============================================================
// Error types pour le moteur de sécurité agent
// ============================================================

use thiserror::Error;

#[derive(Error, Debug)]
pub enum AgentSafetyError {
    #[error("Prompt validation failed: {0}")]
    PromptValidation(String),

    #[error("Resource limit exceeded: {0}")]
    ResourceExceeded(String),

    #[error("Tool validation failed: {0}")]
    ToolValidation(String),

    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Session expired: {0}")]
    SessionExpired(String),

    #[error("Sandbox violation: {0}")]
    SandboxViolation(String),

    #[error("Regex compilation error: {0}")]
    RegexError(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<regex::Error> for AgentSafetyError {
    fn from(e: regex::Error) -> Self {
        AgentSafetyError::RegexError(e.to_string())
    }
}

impl From<std::num::ParseIntError> for AgentSafetyError {
    fn from(e: std::num::ParseIntError) -> Self {
        AgentSafetyError::Internal(e.to_string())
    }
}

impl From<std::num::ParseFloatError> for AgentSafetyError {
    fn from(e: std::num::ParseFloatError) -> Self {
        AgentSafetyError::Internal(e.to_string())
    }
}
