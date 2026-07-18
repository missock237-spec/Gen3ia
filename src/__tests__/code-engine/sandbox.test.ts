/**
 * Tests unitaires — Code Engine Sandbox
 */
import { describe, test, expect } from 'vitest';
import { executeCode, validateCode, checkExecutionQuota } from '../../lib/code-engine/sandbox';

describe('validateCode', () => {
  test('valide un code simple et correct', () => {
    const result = validateCode('console.log("hello")', 'javascript');
    expect(result.valid).toBe(true);
  });

  test('rejette un code vide', () => {
    const result = validateCode('', 'javascript');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('vide');
  });

  test('rejette un code avec require()', () => {
    const result = validateCode('require("fs")', 'javascript');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('dangereux');
  });

  test('rejette un code avec process.env', () => {
    const result = validateCode('console.log(process.env)', 'javascript');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('dangereux');
  });

  test('rejette un code avec eval()', () => {
    const result = validateCode('eval("1+1")', 'javascript');
    expect(result.valid).toBe(false);
  });

  test('rejette un code avec localStorage', () => {
    const result = validateCode('localStorage.getItem("key")', 'javascript');
    expect(result.valid).toBe(false);
  });

  test('rejette un code trop long', () => {
    const longCode = 'x'.repeat(50001);
    const result = validateCode(longCode, 'javascript');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('long');
  });

  test('autorise un code a la limite', () => {
    const code = 'x'.repeat(50000);
    const result = validateCode(code, 'javascript');
    // Si le code atteint la limite sans pattern dangereux
    expect(result.valid).toBe(true);
  });
});

describe('executeCode', () => {
  test('execute un code simple avec console.log', async () => {
    const result = await executeCode({ code: 'console.log("test")', language: 'javascript' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('test');
  });

  test('execute et retourne le resultat final', async () => {
    const result = await executeCode({ code: 'const x = 5; x * 2', language: 'javascript' });
    expect(result.success).toBe(true);
    expect(result.output.some(o => o.includes('10'))).toBe(true);
  });

  test('capture les erreurs', async () => {
    const result = await executeCode({ code: 'throw new Error("erreur test")', language: 'javascript' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('erreur test');
  });

  test('execute du code asynchrone', async () => {
    const result = await executeCode({
      code: 'const x = await Promise.resolve(42); console.log(x)',
      language: 'javascript',
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain('42');
  });

  test('timeout sur une boucle infinie', async () => {
    const result = await executeCode({
      code: 'while(true) {}',
      language: 'javascript',
      timeout: 100,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Timeout');
  }, 5000);

  test('execute plusieurs instructions', async () => {
    const result = await executeCode({
      code: `
        const a = [1, 2, 3];
        const b = a.map(x => x * 2);
        console.log(b);
      `,
      language: 'javascript',
    });
    expect(result.success).toBe(true);
    expect(result.output.some(o => o.includes('2') && o.includes('4') && o.includes('6'))).toBe(true);
  });
});

describe('checkExecutionQuota', () => {
  test('autorise la premiere execution', () => {
    const result = checkExecutionQuota('test-user-1');
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(9);
  });

  test('bloque apres 10 executions', () => {
    const userId = 'test-user-2';
    for (let i = 0; i < 10; i++) {
      checkExecutionQuota(userId, 10);
    }
    const result = checkExecutionQuota(userId, 10);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe('execution complexe', () => {
  test('execute un pipeline de donnees', async () => {
    const result = await executeCode({
      code: `
        const data = [5, 12, 8, 130, 44];
        const filtered = data.filter(n => n > 10);
        const mapped = filtered.map(n => n * 2);
        const sum = mapped.reduce((a, b) => a + b, 0);
        console.log(filtered, mapped, sum);
      `,
      language: 'javascript',
    });
    expect(result.success).toBe(true);
    expect(result.output.some(o => o.includes('130'))).toBe(true);
  });

  test('execute des operations objet', async () => {
    const result = await executeCode({
      code: `
        const obj = { name: "Genova", version: 3, features: ["sandbox", "api"] };
        console.log(Object.keys(obj).length);
        console.log(obj.features.join(","));
      `,
      language: 'javascript',
    });
    expect(result.success).toBe(true);
    expect(result.output.some(o => o.includes('3'))).toBe(true);
    expect(result.output.some(o => o.includes('sandbox'))).toBe(true);
  });
});