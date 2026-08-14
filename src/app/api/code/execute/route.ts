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
    if (!session?.user.id) {
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
        userId: session.user.id,
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

    // Validate: block dangerous patterns before execution
    const dangerousPatterns = [
      /require\s*\(/,          // No require()
      /import\s+/,             // No import
      /process\./,             // No process access
      /global\./,              // No global access
      /__dirname/,             // No filesystem paths
      /child_process/,        // No subprocess
      /eval\s*\(/,            // No eval
      /Function\s*\(/,        // No Function constructor
    ];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(wrappedCode)) {
        return {
          output: '',
          error: `Blocage sécurité: pattern interdit détecté (${pattern.source})`,
          executionTime: Date.now() - startTime,
          memoryUsage: 0,
          exitCode: 1,
        };
      }
    }

    // Try isolated-vm for true sandbox isolation
    let logs: string[] = [];
    try {
      const ivm = await import('isolated-vm');
      const isolate = new ivm.Isolate({ memoryLimit: 128 }); // 128MB max
      const context = isolate.createContextSync();

      // Inject console.log into the isolate
      const logFn = new ivm.Reference(function(...args: any[]) {
        logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
      });
      context.global.setSync('console', {
        log: logFn.derefInto(),
        error: logFn.derefInto(),
        warn: logFn.derefInto(),
      });
      context.global.setSync('input', input || '');

      // Execute with timeout
      const script = new ivm.Script(wrappedCode);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout execution')), SANDBOX_TIMEOUT)
      );

      await Promise.race([
        script.run(context, { timeout: SANDBOX_TIMEOUT }),
        timeoutPromise,
      ]);

      // Get memory usage from isolate
      const heapStats = isolate.getHeapStatistics
        ? isolate.getHeapStatistics()
        : { used_heap_size: 0 };

      isolate.dispose();

      const output = logs.join('\n').slice(0, MAX_OUTPUT_SIZE);
      return {
        output,
        error: null,
        executionTime: Date.now() - startTime,
        memoryUsage: heapStats.used_heap_size || 0,
        exitCode: 0,
      };
    } catch (ivmError: any) {
      // isolated-vm not available — use hardened new Function with strict guards
      // This is a fallback, not as safe as isolated-vm
      if (ivmError?.message?.includes('Cannot find module')) {
        // Hardened fallback: block global access via proxy
        const blockProxy = new Proxy({}, {
          get: () => { throw new Error('Accès global interdit'); },
          set: () => { throw new Error('Accès global interdit'); },
        });

        const logs2: string[] = [];
        const safeConsole = {
          log: (...args: unknown[]) => { logs2.push(args.map(String).join(' ')); },
          error: (...args: unknown[]) => { logs2.push('[ERROR] ' + args.map(String).join(' ')); },
          warn: (...args: unknown[]) => { logs2.push('[WARN] ' + args.map(String).join(' ')); },
        };

        // Strip all dangerous globals from the function scope
        const fn = new Function('console', 'input', 'process', 'require', 'global', 'module',
          'const process=undefined;const require=undefined;const global=undefined;const module=undefined;' +
          wrappedCode
        );

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout execution')), SANDBOX_TIMEOUT)
        );

        await Promise.race([
          Promise.resolve().then(() => fn(safeConsole, input || '', blockProxy, blockProxy, blockProxy, blockProxy)),
          timeoutPromise,
        ]);

        const output = logs2.join('\n').slice(0, MAX_OUTPUT_SIZE);
        return { output, error: null, executionTime: Date.now() - startTime, memoryUsage: 0, exitCode: 0 };
      }
      throw ivmError;
    }
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
