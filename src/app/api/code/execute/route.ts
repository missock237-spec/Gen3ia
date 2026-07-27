import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const SANDBOX_TIMEOUT = 10000;
const MAX_OUTPUT_SIZE = 50000;

interface ExecutionResult {
  output: string;
  error: string | null;
  executionTime: number;
  memoryUsage: number;
  exitCode: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }
    const { code, language, input } = await request.json();
    if (!code || !language) {
      return NextResponse.json({ error: 'Code et langage requis' }, { status: 400 });
    }
    if (code.length > 50000) {
      return NextResponse.json({ error: 'Code trop long (max 50KB)' }, { status: 400 });
    }
    const allowedLanguages = ['javascript','typescript','python','html','css','jsx','tsx','json','bash'];
    if (!allowedLanguages.includes(language)) {
      return NextResponse.json({ error: 'Langage non supporte: ' + language }, { status: 400 });
    }
    const result = await executeInSandbox(code, language, input);
    await prisma.agentActionLog.create({
      data: {
        action: 'code:execute:' + language,
        details: JSON.stringify({ language, codeLength: code.length }),
        status: result.error ? 'failed' : 'completed',
        result: JSON.stringify({ outputLength: result.output.length, executionTime: result.executionTime }),
        userId: session.userId,
      },
    });
    return NextResponse.json({
      success: !result.error,
      ...result,
      language,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false, output: '',
      error: 'Erreur serveur: ' + (error instanceof Error ? error.message : 'Inconnue'),
      executionTime: Date.now() - startTime, memoryUsage: 0, exitCode: 1,
    }, { status: 500 });
  }
}

async function executeInSandbox(code: string, language: string, input?: string): Promise<ExecutionResult> {
  const startTime = Date.now();
  if (['html','css','jsx','tsx'].includes(language)) {
    return executeFrontendCode(code, language, startTime);
  }
  try {
    let wrappedCode = code;
    if (language === 'typescript') {
      try {
        const ts = await import('typescript');
        const transpiled = ts.transpileModule(code, {
          compilerOptions: { module: 1, target: 2, strict: false, esModuleInterop: true },
        });
        wrappedCode = transpiled.outputText;
      } catch { wrappedCode = code; }
    }
    let logs: string[] = [];
    const customConsole = {
      log: (...args: unknown[]) => { logs.push(args.map(String).join(' ')); },
      error: (...args: unknown[]) => { logs.push('[ERROR] ' + args.map(String).join(' ')); },
      warn: (...args: unknown[]) => { logs.push('[WARN] ' + args.map(String).join(' ')); },
    };
    const fn = new Function('console', 'input', wrappedCode);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout execution')), SANDBOX_TIMEOUT)
    );
    await Promise.race([
      Promise.resolve().then(() => fn(customConsole, input || '')),
      timeoutPromise,
    ]);
    const output = logs.join('\n').slice(0, MAX_OUTPUT_SIZE);
    return { output, error: null, executionTime: Date.now() - startTime, memoryUsage: 0, exitCode: 0 };
  } catch (error) {
    return {
      output: '',
      error: 'Erreur: ' + (error instanceof Error ? error.message : 'Inconnue'),
      executionTime: Date.now() - startTime,
      memoryUsage: 0, exitCode: 1,
    };
  }
}

function executeFrontendCode(code: string, language: string, startTime: number): ExecutionResult {
  let html = '', css = '', js = '';
  if (language === 'html') html = code;
  else if (language === 'css') css = code;
  else js = code;
  const fullHtml = '<!DOCTYPE html><html><head><style>' + css + '</style></head><body>' +
    (html.includes('<body>') ? html : '<div id="root">' + html + '</div>') +
    '<script>' + js + '</script></body></html>';
  return { output: fullHtml.slice(0, MAX_OUTPUT_SIZE), error: null, executionTime: Date.now() - startTime, memoryUsage: 0, exitCode: 0 };
}
