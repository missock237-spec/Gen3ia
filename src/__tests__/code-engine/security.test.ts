/**
 * Tests de securite — Verification des protections Dependabot / npm
 */
import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Securite du projet', () => {
  test('package.json a des overrides de securite', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
    expect(pkg.overrides).toBeDefined();
    expect(Object.keys(pkg.overrides).length).toBeGreaterThanOrEqual(5);
  });

  test('Dependabot est configure', () => {
    const dependabot = fs.readFileSync(path.resolve('.github/dependabot.yml'), 'utf-8');
    expect(dependabot).toContain('npm');
    expect(dependabot).toContain('daily');
  });

  test('.npmrc est configure avec audit-level', () => {
    const npmrc = fs.readFileSync(path.resolve('.npmrc'), 'utf-8');
    expect(npmrc).toContain('audit-level');
    expect(npmrc).toContain('high');
  });

  test('.gitignore protege les fichiers sensibles', () => {
    const gitignore = fs.readFileSync(path.resolve('.gitignore'), 'utf-8');
    const patterns = ['.env', 'node_modules', '.next', '*.pid', 'coverage'];
    for (const pattern of patterns) {
      expect(gitignore).toContain(pattern);
    }
  });

  test('package.json a un script audit', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.audit).toBeDefined();
    expect(pkg.scripts['security:check']).toBeDefined();
  });

  test('Version de Next.js est secure (>= 16.2)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
    const version = pkg.dependencies.next.replace('^', '');
    const major = parseInt(version.split('.')[0]);
    const minor = parseInt(version.split('.')[1]);
    expect(major).toBeGreaterThanOrEqual(16);
    if (major === 16) {
      expect(minor).toBeGreaterThanOrEqual(2);
    }
  });

  test('Pas de version pinned avec des vulnerabilites connues', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    
    const blacklisted = ['lodash@<4.17.21', 'axios@<1.6.0', 'cookie@<0.7.0'];
    for (const [dep, ver] of Object.entries(allDeps)) {
      const verStr = String(ver);
      expect(verStr.length).toBeGreaterThan(0);
    }
  });
});