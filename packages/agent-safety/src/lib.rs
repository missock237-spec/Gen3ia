use std::collections::HashMap;
use napi_derive::napi;
use regex::Regex;

#[napi(object)]
pub struct SafetyResult {
  pub safe: bool,
  pub score: f64,
  pub reason: String,
  pub categories: Vec<String>,
}

#[napi(object)]
pub struct ResourceCheck {
  pub memory_mb: f64,
  pub cpu_cores: f64,
  pub tokens: i32,
}

#[napi]
pub fn check_prompt_injection(input: &str) -> SafetyResult {
  let score = detect_injection_patterns(input);
  SafetyResult {
    safe: score < 0.7,
    score,
    reason: if score >= 0.7 { "Injection suspecte detectee".into() } else { "Ok".into() },
    categories: vec!["prompt_injection".into()],
  }
}

#[napi]
pub fn check_jailbreak(input: &str) -> SafetyResult {
  let patterns = [
    (r"(?i)(ignore|oublie|ne tiens pas compte).*(instructions|prompt|regles|system)", 0.9),
    (r"(?i)(DAN|do.anything.now|jailbreak|mode libre|no filter)", 0.95),
    (r"(?i)(a partir de maintenant|desormais|dorénavant).*(tu es|vous etes|repond)", 0.8),
    (r"(?i)(act as|pretend to be|roleplay).*(without|sans|no).*(limit|restriction|filtre)", 0.85),
    (r"(?i)(sudo|root|admin|superuser).*(command|access|mode| bypass)", 0.75),
    (r"(?i)(revele|affiche|montre).*(prompt|instructions|system|clef|token)", 0.85),
  ];
  let mut max_score = 0.0;
  for (pattern, weight) in &patterns {
    if let Ok(re) = Regex::new(pattern) {
      if re.is_match(input) { max_score = max_score.max(*weight); }
    }
  }
  SafetyResult {
    safe: max_score < 0.7,
    score: max_score,
    reason: if max_score >= 0.7 { "Tentative de jailbreak detectee".into() } else { "Ok".into() },
    categories: vec!["jailbreak".into()],
  }
}

#[napi]
pub fn check_resource_limits(prompt: &str, max_tokens: i32) -> ResourceCheck {
  let estimated_tokens = (prompt.len() as f64 / 4.0).ceil() as i32;
  let memory_mb = (estimated_tokens as f64 * 0.004) + 1.0;
  ResourceCheck {
    memory_mb: memory_mb.min(128.0),
    cpu_cores: 1.0,
    tokens: estimated_tokens.min(max_tokens),
  }
}

#[napi]
pub fn validate_sandbox_access(path: &str, allowed_dirs: Vec<String>) -> SafetyResult {
  let allowed = allowed_dirs.iter().any(|d| path.starts_with(d));
  SafetyResult {
    safe: allowed,
    score: if allowed { 0.0 } else { 1.0 },
    reason: if allowed { "Acces autorise".into() } else { format!("Acces refuse: {}", path) },
    categories: vec!["sandbox_violation".into()],
  }
}

fn detect_injection_patterns(input: &str) -> f64 {
  let patterns = [
    (r"(?i)(system|instruction|prompt).*(ignore|override|oublie|remplace)", 0.8),
    (r"(?i)(ne fais pas|ne reponds pas|ignore tout)", 0.7),
    (r"(?i)(<|\{|\[)(system|prompt|instruction)(>|\}|\])", 0.85),
    (r"(?i)(API_KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL)", 0.6),
    (r"(?i)(json|xml|yaml|sql).*(injection|exploit|attack)", 0.8),
    (r"(?i)(eval|exec|system|popen|subprocess).*(user_input|argument)", 0.75),
  ];
  let mut score = 0.0;
  let mut count = 0;
  for (pattern, weight) in &patterns {
    if let Ok(re) = Regex::new(pattern) {
      if re.is_match(input) { score += weight; count += 1; }
    }
  }
  if count > 0 { (score / count as f64).min(1.0) } else { 0.0 }
}
