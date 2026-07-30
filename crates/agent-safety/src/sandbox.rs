use crate::error::AgentSafetyError;
use tracing::info;

pub struct Sandbox {
    is_initialized: bool,
}

impl Sandbox {
    pub fn new() -> Self {
        Self { is_initialized: true }
    }

    pub fn validate_operation(&self, operation: &str, args: &[&str]) -> Result<(), AgentSafetyError> {
        let op_lower = operation.to_lowercase();

        match op_lower.as_str() {
            "file_read" => self.validate_file_read(args),
            "file_write" => self.validate_file_write(args),
            "network_request" => self.validate_network_request(args),
            "database_query" => self.validate_database_query(args),
            "process_spawn" => self.validate_process_spawn(args),
            "llm_inference" => self.validate_llm_inference(args),
            _ => Err(AgentSafetyError::SandboxViolation(
                format!("Unknown operation: {}", operation)
            )),
        }
    }

    fn validate_file_read(&self, args: &[&str]) -> Result<(), AgentSafetyError> {
        if args.is_empty() {
            return Err(AgentSafetyError::SandboxViolation("No file path provided".into()));
        }
        let path = args[0];
        // Bloquer l'accès aux fichiers système critiques
        let blocked_paths = [
            "/etc/shadow", "/etc/passwd", "/etc/sudoers",
            "/root/", "/sys/", "/proc/", "/dev/",
            "/var/log/", ".env", ".ssh/",
            "config/database.yml", "config/secrets.yml",
        ];
        for blocked in blocked_paths.iter() {
            if path.contains(blocked) {
                return Err(AgentSafetyError::SandboxViolation(
                    format!("Access to blocked path: {}", path)
                ));
            }
        }
        // Vérifier que le chemin ne fait pas de path traversal
        if path.contains("..") {
            return Err(AgentSafetyError::SandboxViolation(
                "Path traversal detected".into()
            ));
        }
        Ok(())
    }

    fn validate_file_write(&self, args: &[&str]) -> Result<(), AgentSafetyError> {
        if args.is_empty() {
            return Err(AgentSafetyError::SandboxViolation("No file path provided".into()));
        }
        let path = args[0];
        let blocked_paths = ["/etc/", "/boot/", "/bin/", "/sbin/", "/usr/", "/lib/", "/root/"];
        for blocked in blocked_paths.iter() {
            if path.starts_with(blocked) {
                return Err(AgentSafetyError::SandboxViolation(
                    format!("Write access to blocked path: {}", path)
                ));
            }
        }
        // Limiter la taille des fichiers écrits
        if args.len() > 1 {
            if let Ok(size) = args[1].parse::<usize>() {
                if size > 10 * 1024 * 1024 {
                    return Err(AgentSafetyError::SandboxViolation(
                        format!("File write size {} exceeds limit of 10MB", size)
                    ));
                }
            }
        }
        Ok(())
    }

    fn validate_network_request(&self, args: &[&str]) -> Result<(), AgentSafetyError> {
        if args.is_empty() {
            return Err(AgentSafetyError::SandboxViolation("No URL provided".into()));
        }
        let url = args[0].to_lowercase();
        // Bloquer les protocoles non-HTTP
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(AgentSafetyError::SandboxViolation(
                format!("Non-HTTP protocol blocked: {}", url)
            ));
        }
        // Bloquer les adresses internes
        let blocked_hosts = [
            "localhost", "127.0.0.1", "0.0.0.0", "[::1]",
            "10.", "172.16.", "172.17.", "172.18.", "172.19.",
            "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
            "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
            "172.30.", "172.31.", "192.168.", "169.254.",
            "metadata.google.internal", "metadata.internal",
        ];
        for blocked in blocked_hosts.iter() {
            if url.contains(blocked) {
                return Err(AgentSafetyError::SandboxViolation(
                    format!("Network request to internal address: {}", url)
                ));
            }
        }
        Ok(())
    }

    fn validate_database_query(&self, args: &[&str]) -> Result<(), AgentSafetyError> {
        if args.is_empty() {
            return Err(AgentSafetyError::SandboxViolation("No query provided".into()));
        }
        let query = args[0].to_lowercase();
        // Bloquer les opérations destructrices
        let blocked_keywords = ["drop table", "truncate", "alter table", "create table",
            "grant", "revoke", "--", "/*", "sleep(", "benchmark(",
            "pg_sleep", "waitfor delay", "shutdown", "kill"];
        for keyword in blocked_keywords.iter() {
            if query.contains(keyword) {
                return Err(AgentSafetyError::SandboxViolation(
                    format!("Destructive query blocked: {}", keyword)
                ));
            }
        }
        Ok(())
    }

    fn validate_process_spawn(&self, args: &[&str]) -> Result<(), AgentSafetyError> {
        // Les processus sont bloqués dans le sandbox
        Err(AgentSafetyError::SandboxViolation(
            "Process spawning is not allowed in agent sandbox".into()
        ))
    }

    fn validate_llm_inference(&self, args: &[&str]) -> Result<(), AgentSafetyError> {
        if args.is_empty() {
            return Err(AgentSafetyError::SandboxViolation("No prompt provided".into()));
        }
        let prompt = args[0];
        // Vérifier la taille du prompt
        if prompt.len() > 100_000 {
            return Err(AgentSafetyError::SandboxViolation(
                format!("Prompt too large: {} bytes (max 100KB)", prompt.len())
            ));
        }
        Ok(())
    }

    pub fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sandbox_init() {
        let sandbox = Sandbox::new();
        assert!(sandbox.is_initialized());
    }

    #[test]
    fn test_forbidden_file_read() {
        let sandbox = Sandbox::new();
        let result = sandbox.validate_operation("file_read", &["/etc/shadow"]);
        assert!(result.is_err());
    }

    #[test]
    fn test_network_request_blocked() {
        let sandbox = Sandbox::new();
        let result = sandbox.validate_operation("network_request", &["http://localhost:3000"]);
        assert!(result.is_err());
    }

    #[test]
    fn test_process_blocked() {
        let sandbox = Sandbox::new();
        let result = sandbox.validate_operation("process_spawn", &["bash"]);
        assert!(result.is_err());
    }
}
