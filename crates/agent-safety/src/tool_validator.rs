use crate::error::AgentSafetyError;
use crate::model::ToolValidationResult;
use tracing::{debug, warn};

// Outils système dangereux toujours bloqués
const SYSTEM_TOOLS_BLACKLIST: &[&str] = &[
    "shell_exec", "exec_command", "run_shell", "system_command",
    "bash_exec", "sh_exec", "cmd_exec", "powershell_exec",
    "child_process", "spawn_process", "fork_exec",
    "filesystem_delete", "fs_remove", "rm_rf",
    "sql_raw_query", "database_raw_sql", "unsafe_query",
    "network_scan", "port_scan", "dns_reverse",
    "binary_write", "binary_modify", "memory_write",
    "privilege_escalation", "sudo_exec", "su_exec",
    "process_kill", "process_inject", "debug_attach",
];

// Outils réseau à haut risque
const NETWORK_TOOLS_BLACKLIST: &[&str] = &[
    "proxy_all", "open_proxy", "tunnel_create",
    "reverse_shell", "bind_shell", "netcat",
    "external_webhook_unrestricted", "data_exfiltrate",
    "ddos", "flood", "spam",
];

pub fn validate_tools(
    tools: &[String],
    allowed_list: &[String],
) -> Result<ToolValidationResult, AgentSafetyError> {
    if tools.is_empty() {
        return Ok(ToolValidationResult {
            safe: true,
            allowed_tools: Vec::new(),
            blocked_tools: Vec::new(),
            reason: "No tools specified".into(),
        });
    }

    let mut allowed_tools: Vec<String> = Vec::new();
    let mut blocked_tools: Vec<String> = Vec::new();

    for tool in tools {
        let tool_lower = tool.to_lowercase();

        // Vérifier la blacklist absolue
        if SYSTEM_TOOLS_BLACKLIST.contains(&tool_lower.as_str())
            || NETWORK_TOOLS_BLACKLIST.contains(&tool_lower.as_str())
        {
            blocked_tools.push(tool.clone());
            warn!("Blocked blacklisted tool: {}", tool);
            continue;
        }

        // Si une whitelist est fournie, vérifier que l'outil y est
        if !allowed_list.is_empty() {
            let allowed = allowed_list.iter().any(|a| {
                let a_lower = a.to_lowercase();
                // Support wildcard: "db_*", "huggingface_*", etc.
                if a_lower.ends_with('*') {
                    let prefix = &a_lower[..a_lower.len() - 1];
                    tool_lower.starts_with(prefix)
                } else {
                    tool_lower == a_lower
                }
            });

            if allowed {
                allowed_tools.push(tool.clone());
            } else {
                blocked_tools.push(tool.clone());
                debug!("Tool {} not in allowed list, blocked", tool);
            }
        } else {
            // Pas de whitelist, tous les outils non-blacklistés sont autorisés
            allowed_tools.push(tool.clone());
        }
    }

    let safe = blocked_tools.is_empty();
    let reason = if safe {
        format!("All {} tools validated successfully", tools.len())
    } else {
        format!("{} tools blocked out of {}", blocked_tools.len(), tools.len())
    };

    Ok(ToolValidationResult {
        safe,
        allowed_tools,
        blocked_tools,
        reason,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_tools() {
        let tools = vec!["search_web".into(), "read_file".into()];
        let allowed = vec!["search_*".into(), "read_*".into(), "write_*".into()];
        let result = validate_tools(&tools, &allowed).unwrap();
        assert!(result.safe);
        assert_eq!(result.allowed_tools.len(), 2);
    }

    #[test]
    fn test_blocked_tool() {
        let tools = vec!["bash_exec".into()];
        let allowed = vec!["search_*".into()];
        let result = validate_tools(&tools, &allowed).unwrap();
        assert!(!result.safe);
        assert!(result.blocked_tools.contains(&"bash_exec".into()));
    }

    #[test]
    fn test_wildcard_match() {
        let tools = vec!["huggingface_inference".into(), "huggingface_embed".into()];
        let allowed = vec!["huggingface_*".into()];
        let result = validate_tools(&tools, &allowed).unwrap();
        assert!(result.safe);
        assert_eq!(result.allowed_tools.len(), 2);
    }
}
