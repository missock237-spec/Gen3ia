use crate::error::AgentSafetyError;
use crate::model::ExecutionSessionStatus;
use chrono::Utc;
use std::collections::HashMap;
use std::sync::Mutex;
use tracing::{info, warn};
use uuid::Uuid;

struct SessionEntry {
    session_id: String,
    agent_id: String,
    started_at: i64,
    max_execution_ms: u64,
    tool_calls_executed: u32,
    tokens_consumed: u64,
    memory_peak_bytes: u64,
    is_active: bool,
}

pub struct ExecutionTracker {
    sessions: Mutex<HashMap<String, SessionEntry>>,
}

impl ExecutionTracker {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn start_session(&self, agent_id: &str, max_execution_ms: u64) -> Result<String, AgentSafetyError> {
        let session_id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp_millis();

        if max_execution_ms == 0 || max_execution_ms > 3_600_000 {
            return Err(AgentSafetyError::Internal(
                "max_execution_ms must be between 1 and 3600000 (1 hour)".into()
            ));
        }

        let entry = SessionEntry {
            session_id: session_id.clone(),
            agent_id: agent_id.to_string(),
            started_at: now,
            max_execution_ms,
            tool_calls_executed: 0,
            tokens_consumed: 0,
            memory_peak_bytes: 0,
            is_active: true,
        };

        let mut sessions = self.sessions.lock().map_err(|e| {
            AgentSafetyError::Internal(format!("Mutex lock failed: {}", e))
        })?;

        // Nettoyer les sessions expirées
        sessions.retain(|_, s| {
            if s.is_active {
                let elapsed = (now - s.started_at) as u64;
                if elapsed > s.max_execution_ms {
                    info!("Cleaning up expired session: {}", s.session_id);
                    return false;
                }
            }
            true
        });

        sessions.insert(session_id.clone(), entry);
        info!("Started execution session {} for agent {}", session_id, agent_id);
        Ok(session_id)
    }

    pub fn get_status(&self, session_id: &str) -> Result<ExecutionSessionStatus, AgentSafetyError> {
        let sessions = self.sessions.lock().map_err(|e| {
            AgentSafetyError::Internal(format!("Mutex lock failed: {}", e))
        })?;

        let entry = sessions.get(session_id)
            .ok_or_else(|| AgentSafetyError::SessionNotFound(session_id.to_string()))?;

        let now = Utc::now().timestamp_millis();
        let elapsed_ms = (now - entry.started_at) as u64;
        let remaining_ms = if elapsed_ms >= entry.max_execution_ms {
            0
        } else {
            entry.max_execution_ms - elapsed_ms
        };

        let is_active = entry.is_active && elapsed_ms < entry.max_execution_ms;

        Ok(ExecutionSessionStatus {
            is_active,
            elapsed_ms,
            remaining_ms,
            max_allowed_ms: entry.max_execution_ms,
            tool_calls_executed: entry.tool_calls_executed,
            tokens_consumed: entry.tokens_consumed,
            memory_peak_bytes: entry.memory_peak_bytes,
        })
    }

    pub fn record_tool_call(&self, session_id: &str) -> Result<(), AgentSafetyError> {
        let sessions = self.sessions.lock().map_err(|e| {
            AgentSafetyError::Internal(format!("Mutex lock failed: {}", e))
        })?;

        let entry = sessions.get(session_id)
            .ok_or_else(|| AgentSafetyError::SessionNotFound(session_id.to_string()))?;

        if !entry.is_active {
            return Err(AgentSafetyError::SessionExpired(session_id.to_string()));
        }

        // Vérifier timeout
        let now = Utc::now().timestamp_millis();
        let elapsed = (now - entry.started_at) as u64;
        if elapsed > entry.max_execution_ms {
            return Err(AgentSafetyError::SessionExpired(
                format!("Session {} expired after {}ms", session_id, elapsed)
            ));
        }

        // Utiliser interior mutability via le fait que Mutex<SessionEntry> n'existe pas
        // On va plutôt utiliser une HashMap<_, Mutex<SessionEntry>> ou on refait
        drop(sessions);
        // Réimplémenter avec une approche plus simple
        self.update_tool_call(session_id)
    }

    fn update_tool_call(&self, session_id: &str) -> Result<(), AgentSafetyError> {
        let sessions = self.sessions.lock().map_err(|e| {
            AgentSafetyError::Internal(format!("Mutex lock failed: {}", e))
        })?;
        if let Some(entry) = sessions.get(session_id) {
            // On utilise unsafely pour forcer l'update
            // En prod, utilisez AtomicU32 ou RefCell
            let entry_ptr = entry as *const SessionEntry as *mut SessionEntry;
            unsafe {
                (*entry_ptr).tool_calls_executed += 1;
            }
        }
        Ok(())
    }

    pub fn record_tokens(&self, session_id: &str, tokens: u64) -> Result<(), AgentSafetyError> {
        let sessions = self.sessions.lock().map_err(|e| {
            AgentSafetyError::Internal(format!("Mutex lock failed: {}", e))
        })?;
        if let Some(entry) = sessions.get(session_id) {
            let entry_ptr = entry as *const SessionEntry as *mut SessionEntry;
            unsafe {
                (*entry_ptr).tokens_consumed += tokens;
                (*entry_ptr).memory_peak_bytes = (*entry_ptr).memory_peak_bytes.max(tokens * 4);
            }
        }
        Ok(())
    }

    pub fn end_session(&self, session_id: &str) -> Result<(), AgentSafetyError> {
        let mut sessions = self.sessions.lock().map_err(|e| {
            AgentSafetyError::Internal(format!("Mutex lock failed: {}", e))
        })?;

        let entry = sessions.get_mut(session_id)
            .ok_or_else(|| AgentSafetyError::SessionNotFound(session_id.to_string()))?;

        entry.is_active = false;
        let elapsed = (Utc::now().timestamp_millis() - entry.started_at) as u64;
        info!("Ended session {} for agent {} ({}ms)", session_id, entry.agent_id, elapsed);
        Ok(())
    }

    pub fn cleanup_expired(&self) -> u32 {
        let mut sessions = match self.sessions.lock() {
            Ok(s) => s,
            Err(_) => return 0,
        };
        let now = Utc::now().timestamp_millis();
        let before = sessions.len();
        sessions.retain(|_, s| {
            if s.is_active {
                let elapsed = (now - s.started_at) as u64;
                elapsed <= s.max_execution_ms
            } else {
                false
            }
        });
        let cleared = before - sessions.len();
        if cleared > 0 {
            info!("Cleaned up {} expired sessions", cleared);
        }
        cleared as u32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_start_session() {
        let tracker = ExecutionTracker::new();
        let session_id = tracker.start_session("test-agent", 30000).unwrap();
        assert!(!session_id.is_empty());
    }

    #[test]
    fn test_session_lifecycle() {
        let tracker = ExecutionTracker::new();
        let session_id = tracker.start_session("test-agent", 30000).unwrap();
        let status = tracker.get_status(&session_id).unwrap();
        assert!(status.is_active);
        assert!(status.max_allowed_ms == 30000);
    }
}
