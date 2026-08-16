// Type declarations for modules not directly in package.json
// (transitive deps or workspace packages without built types)

declare module "next-auth/jwt" {
  import type { NextRequest } from "next/server";
  export interface Token {
    sub?: string;
    email?: string;
    name?: string;
    role?: string;
    [key: string]: unknown;
  }
  export async function getToken(options?: {
    req?: NextRequest | Request;
    secret?: string;
  }): Promise<Token | null>;
}

declare module "isolated-vm" {
  export class Isolate {
    constructor(options?: { memoryLimit?: number });
    createContext(): Context;
    dispose(): void;
  }
  export class Context {
    eval(code: string): any;
    reference(): Reference;
    release(): void;
  }
  export class Reference {
    apply(...args: any[]): any;
    release(): void;
  }
}

declare module "@gen3ia/agent-safety" {
  export function checkPromptInjection(input: string): Promise<{ detected: boolean; score: number; patterns?: string[] }>;
  export function checkJailbreak(input: string): Promise<{ detected: boolean; score: number; patterns?: string[] }>;
}
