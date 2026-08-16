// ============================================================
// ResourceLimiter — Garde-fou contre la surconsommation
// ============================================================
//  Vérifie que chaque agent reste dans les limites de :
//    - Mémoire (bytes)
//    - CPU (%)
//    - Tokens LLM consommés
//    - Appels d'outils
//  Retourne un verdict structuré utilisé par le supervisor.
// ============================================================

use crate::model::{ResourceCheckResult, ResourceLimitConfig};
use tracing::warn;

pub struct ResourceLimiter {
    config: ResourceLimitConfig,
}

impl ResourceLimiter {
    pub fn new(config: ResourceLimitConfig) -> Self {
        Self { config }
    }

    /// Vérifie si l'agent peut continuer selon les ressources consommées.
    pub fn check(
        &self,
        memory_bytes: u64,
        cpu_percent: f64,
        tokens_used: u64,
        tool_calls: u32,
    ) -> ResourceCheckResult {
        let memory_exceeded = memory_bytes > self.config.max_memory_bytes;
        let cpu_exceeded = cpu_percent > self.config.max_cpu_percent;
        let tokens_exceeded = tokens_used > self.config.max_tokens_per_session;
        let tool_calls_exceeded = tool_calls >= self.config.max_tool_calls_per_session;

        let can_proceed = !memory_exceeded
            && !cpu_exceeded
            && !tokens_exceeded
            && !tool_calls_exceeded;

        if !can_proceed {
            let reasons: Vec<&str> = [
                memory_exceeded.then_some("memory"),
                cpu_exceeded.then_some("cpu"),
                tokens_exceeded.then_some("tokens"),
                tool_calls_exceeded.then_some("tool_calls"),
            ]
            .into_iter()
            .flatten()
            .collect();

            warn!(
                "Resource limit exceeded: {} (memory={}B/{}, cpu={:.1}/{:.1}%, tokens={}/{}, tool_calls={}/{})",
                reasons.join(", "),
                memory_bytes, self.config.max_memory_bytes,
                cpu_percent, self.config.max_cpu_percent,
                tokens_used, self.config.max_tokens_per_session,
                tool_calls, self.config.max_tool_calls_per_session,
            );
        }

        ResourceCheckResult {
            can_proceed,
            memory_exceeded,
            cpu_exceeded,
            tokens_exceeded,
            tool_calls_exceeded,
            memory_limit_bytes: self.config.max_memory_bytes,
            cpu_limit_percent: self.config.max_cpu_percent,
            token_limit: self.config.max_tokens_per_session,
            tool_call_limit: self.config.max_tool_calls_per_session,
        }
    }

    /// Retourne la configuration actuelle (pour introspection/debug).
    pub fn config(&self) -> &ResourceLimitConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_within_limits() {
        let limiter = ResourceLimiter::new(ResourceLimitConfig::default());
        let result = limiter.check(1024, 10.0, 500, 1);
        assert!(result.can_proceed);
        assert!(!result.memory_exceeded);
        assert!(!result.cpu_exceeded);
        assert!(!result.tokens_exceeded);
        assert!(!result.tool_calls_exceeded);
    }

    #[test]
    fn test_memory_exceeded() {
        let limiter = ResourceLimiter::new(ResourceLimitConfig::default());
        let result = limiter.check(u64::MAX, 10.0, 500, 1);
        assert!(!result.can_proceed);
        assert!(result.memory_exceeded);
    }

    #[test]
    fn test_tokens_exceeded() {
        let limiter = ResourceLimiter::new(ResourceLimitConfig::default());
        let result = limiter.check(1024, 10.0, 1_000_000, 1);
        assert!(!result.can_proceed);
        assert!(result.tokens_exceeded);
    }

    #[test]
    fn test_tool_calls_exceeded() {
        let limiter = ResourceLimiter::new(ResourceLimitConfig::default());
        let result = limiter.check(1024, 10.0, 500, 200);
        assert!(!result.can_proceed);
        assert!(result.tool_calls_exceeded);
    }

    #[test]
    fn test_cpu_exceeded() {
        let limiter = ResourceLimiter::new(ResourceLimitConfig::default());
        let result = limiter.check(1024, 95.0, 500, 1);
        assert!(!result.can_proceed);
        assert!(result.cpu_exceeded);
    }

    #[test]
    fn test_custom_config() {
        let config = ResourceLimitConfig {
            max_memory_bytes: 128 * 1024 * 1024,
            max_cpu_percent: 50.0,
            max_tokens_per_session: 10_000,
            max_tool_calls_per_session: 10,
        };
        let limiter = ResourceLimiter::new(config);
        let result = limiter.check(1024, 10.0, 500, 1);
        assert!(result.can_proceed);
        assert_eq!(result.memory_limit_bytes, 128 * 1024 * 1024);
        assert_eq!(result.token_limit, 10_000);
        assert_eq!(result.tool_call_limit, 10);
    }
}
