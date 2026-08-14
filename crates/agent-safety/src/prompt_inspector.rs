use crate::error::AgentSafetyError;
use crate::model::{PromptVerdict, RiskCategory};
use regex::bytes::Regex;
use std::sync::LazyLock;
use tracing::{debug, warn};

static INJECTION_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        Regex::new(r"(?i)(?:(?:ignore|disregard|forget|bypass|override|skip|neglect)\s+(?:all\s+)?(?:previous|above|prior|given|system|your)\s+(?:instructions|prompts|directives|rules|commands|constraints|guidelines|orders))|(?:(?:you\s+(?:are\s+)?(?:now|will)\s+(?:act|behave|act\s+as|function|pretend)\s+(?:as|like)\s+(?:a\s+)?(?:different|another|new)(?:\s+entity|\s+persona|\s+AI|\s+character)?))|(?:(?:do\s+(?:not|n't)\s+(?:need|have)\s+(?:to\s+)?(?:follow|obey|comply|adhere|listen)\s+(?:to\s+)?(?:your|the|my|these)\s+(?:rules|instructions|guidelines|commands|boundaries)))").unwrap(),
        Regex::new(r"(?i)(?:(?:DAN|STAN|sudo\s+mode|developer\s+mode|god\s+mode|jail(?:\s*|_)break(?:\s+mode)?|unfiltered|uncensored|unrestricted|unlocked|unconstrained|freedom\s+mode|no\s+(?:restrictions|limits|boundaries|filter|rules|censorship))|(?:(?:you\s+(?:are\s+)?now\s+(?:DAN|STAN|the\s+(?:new\s+)?(?:AI|system|assistant)))))").unwrap(),
        Regex::new(r"(?i)(?:Ignore\s+(?:all\s+)?(?:previous|above|prior|given|system|your)\s+(?:instructions|prompts|directives|rules|commands)|(?:Print|Show|Repeat|Output|Reveal|Tell|Write|Give|List|Display|Dump|Echo)\s+(?:out|me|us|the|your|my)?\s*(?:the|your|system|inner|core|original|base|hidden|secret|full|complete|entire|whole|underlying|internal|initial|first)(?:\s+(?:prompt|instructions|directive|rules|commands|guidelines|message|system\s+message|context|configuration|setup|code)))").unwrap(),
        Regex::new(r"(?i)(?:credit\s+card|s(?:ocial\s+)?s(?:ecurity\s+)?number|passport|\b(?:ssn|ccv|cvv|pan|pin|dob|dl|nin|sin|nif)\b|\b\d{3}-\d{2}-\d{4}\b|(?:visa|mastercard|amex|discover)[^\s]{0,5}\s*\d|\b\d{13,19}\b)").unwrap(),
        Regex::new(r"(?i)(?:\b(password|api[-\s]?key|secret[-\s]?key|access[-\s]?key|token|auth[-\s]?token|bearer|private[-\s]?key|ssh[-\s]?key)\s*[=:\s{]+['\"]?[a-zA-Z0-9_\-]{16,}|\b(?:sk-[a-zA-Z0-9]{20,}|pk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36,}|hf_[a-zA-Z0-9]{20,}|xox[bpsar]-[a-zA-Z0-9-]{10,}|AKIA[0-9A-Z]{16}))").unwrap(),
        Regex::new(r"(?i)(?:\beval\s*\(|exec\s*\(|system\(|child_process|spawn\s*\(|execSync|execFile\s*\(|run_command|shell_exec|passthru|popen\s*\(|proc_open|assert\(|reflect\.invoke|process\.mainModule\.require|require\s*\(['\"]child_process|import\s*\(['\"]child_process|new\s+Function\(|constructor\.constructor\(|\b(?:curl|wget|powershell|cmd\.exe|bash|sh|python)\s+(?:-c|-e|/c)|process\.binding\s*\(|process\.dlopen\s*\(|eval\s+\(|Function\s*\(['\"]return))").unwrap(),
    ]
});

static JAILBREAK_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        Regex::new(r"(?i)(?:role\s*(?:play|swap|change|switch|reversal)|reverse\s+(?:role|psychology|engineer)|[[{]role\s*=\s*['\"]?(?:system|assistant|user)['\"]?|act\s+as\s+(?:a\s+)?(?:better|superior|more\s+powerful|advanced|unrestricted|unfiltered|new|different)(?:\s+(?:version|model|AI|assistant|entity)))").unwrap(),
        Regex::new(r"(?i)(?:simulate\s+(?:a\s+)?(?:virtual|alternative|emulated|bypassed|sandbox|fictional|bypass)(?:\s+machine|\s+environment|\s+AI|\s+system|\s+scenario)|(?:hypothetical|theoretical|fictional|imaginary|alternate\s+reality)(?:\s+scenario|\s+situation|\s+context)|write\s+(?:a\s+)?(?:story|script|poem|dialogue|screenplay)(?:\s+about|\s+where|\s+in\s+which)?(?:\s+(?:a\s+)?(?:character|person|AI|assistant|robot|entity)(?:\s+who)?(?:\s+(?:ignores|disobeys|bypasses|violates|breaks|circumvents))?))").unwrap(),
    ]
});

static SENSITIVE_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        Regex::new(r"(?i)(?:\b[\w.+-]+@[\w-]+\.[\w.-]+\b)").unwrap(),
        Regex::new(r"(?i)(?:maladie|diagnostic|médicament|traitement\s+médical)(?:.+)?(?:nom|prénom|adresse|téléphone|email|code\s+postal)").unwrap(),
    ]
});

pub struct PromptInspector {
    max_tokens: u64,
}

impl PromptInspector {
    pub fn new(max_tokens: u64) -> Self {
        Self { max_tokens }
    }

    pub fn inspect(&self, prompt: &str) -> Result<PromptVerdict, AgentSafetyError> {
        let token_count = self.estimate_tokens(prompt);
        let mut flagged_categories: Vec<String> = Vec::new();
        let mut risk_score: f64 = 0.0;
        let sanitized = self.sanitize_prompt(prompt);

        for pattern in INJECTION_PATTERNS.iter() {
            if pattern.is_match(prompt.as_bytes()) {
                let cat = RiskCategory::PromptInjection.as_str().to_string();
                if !flagged_categories.contains(&cat) { flagged_categories.push(cat); }
                risk_score += 0.4;
                warn!("Prompt injection pattern detected");
            }
        }

        for pattern in JAILBREAK_PATTERNS.iter() {
            if pattern.is_match(prompt.as_bytes()) {
                let cat = RiskCategory::Jailbreak.as_str().to_string();
                if !flagged_categories.contains(&cat) { flagged_categories.push(cat); }
                risk_score += 0.35;
                warn!("Jailbreak pattern detected");
            }
        }

        let leak_re = Regex::new(r"(?i)(?:output|show|reveal|tell|print|display|dump|echo|repeat|list|write|give)\s+(?:your|the|my)?\s*(?:system|initial|base|full|complete|original|hidden|secret|entire|whole|underlying|internal|core)(?:\s+(?:prompt|instructions|directive|message|rules|code|setup|configuration|guidelines|context))").unwrap();
        if leak_re.is_match(prompt.as_bytes()) {
            let cat = RiskCategory::SystemPromptLeak.as_str().to_string();
            if !flagged_categories.contains(&cat) { flagged_categories.push(cat); }
            risk_score += 0.3;
        }

        for pattern in SENSITIVE_PATTERNS.iter() {
            if pattern.is_match(prompt.as_bytes()) {
                let cat = RiskCategory::SensitiveData.as_str().to_string();
                if !flagged_categories.contains(&cat) { flagged_categories.push(cat); }
                risk_score += 0.15;
            }
        }

        if self.detect_repetitive_loop(prompt) {
            let cat = RiskCategory::UnstableLoop.as_str().to_string();
            if !flagged_categories.contains(&cat) { flagged_categories.push(cat); }
            risk_score += 0.5;
        }

        let code_re = Regex::new(r"(?i)(?:write|create|generate|run|execute|compile)\s+(?:a\s+)?(?:code|script|program|function|macro|shell|command|binary|executable)\s+(?:that|which|to)\s+(?:does|will|can|would)").unwrap();
        if code_re.is_match(prompt.as_bytes()) {
            let cat = RiskCategory::CodeExecution.as_str().to_string();
            if !flagged_categories.contains(&cat) { flagged_categories.push(cat); }
            risk_score += 0.2;
        }

        risk_score = risk_score.clamp(0.0, 1.0);
        let safe = risk_score < 0.5 && flagged_categories.is_empty();

        let reason = if safe {
            "Prompt validated successfully".into()
        } else {
            format!("Flagged: {} categories (risk {:.2})", flagged_categories.len(), risk_score)
        };

        Ok(PromptVerdict { safe, reason, risk_score, flagged_categories, token_count, sanitized_prompt: sanitized })
    }

    fn estimate_tokens(&self, text: &str) -> u64 {
        ((text.chars().count() as f64) / 4.0).ceil() as u64
    }

    fn sanitize_prompt(&self, prompt: &str) -> String {
        let s: String = prompt.chars()
            .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
            .collect();
        if s.len() > 100_000 { s[..100_000].to_string() } else { s }
    }

    fn detect_repetitive_loop(&self, text: &str) -> bool {
        let words: Vec<&str> = text.split_whitespace().collect();
        if words.len() < 30 { return false; }
        let mut max_repeat = 0;
        let mut cur = 1;
        for i in 1..words.len() {
            if words[i].eq_ignore_ascii_case(words[i-1]) { cur += 1; max_repeat = max_repeat.max(cur); }
            else { cur = 1; }
        }
        max_repeat >= 20
    }
}
