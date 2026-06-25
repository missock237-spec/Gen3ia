/**
 * Integrated Terminal Manager — Genova AI OS
 */
import { getAutoSandbox } from './sandbox';

export class TerminalManager {
  async execute(command: string, language: 'javascript' | 'python' | 'bash' = 'javascript') {
    const { sandbox } = await getAutoSandbox();
    const lang = language === 'bash' ? 'python' : language;
    const result = await sandbox.executeCode(command, lang);

    return {
      stdout: result.stdout.join('\n'),
      stderr: result.stderr.join('\n'),
      exitCode: result.exitCode ?? (result.status === 'completed' ? 0 : 1)
    };
  }
}
