export interface SafetyResult {
  safe: boolean;
  score: number;
  reason: string;
  categories: string[];
}

export interface ResourceCheck {
  memoryMb: number;
  cpuCores: number;
  tokens: number;
}

export function checkPromptInjection(input: string): SafetyResult;
export function checkJailbreak(input: string): SafetyResult;
export function checkResourceLimits(prompt: string, maxTokens: number): ResourceCheck;
export function validateSandboxAccess(path: string, allowedDirs: string[]): SafetyResult;
