// ============================================================
// Gen3ia Evolution Engine — Tests: git branch naming
// ============================================================
// Pure-function tests for branch name generation.
// ============================================================

import { describe, it, expect } from 'vitest';
import { makeEvolutionBranchName } from '../git';

describe('makeEvolutionBranchName', () => {
  it('produces a name with evolution/ prefix', () => {
    const name = makeEvolutionBranchName('agents', 'fix-null-check');
    expect(name.startsWith('evolution/')).toBe(true);
  });

  it('includes the date in YYYY-MM-DD format', () => {
    const name = makeEvolutionBranchName('agents', 'fix-null-check');
    // Strip the "evolution/" prefix, then take the first 3 dash-separated parts.
    const withoutPrefix = name.replace(/^evolution\//, '');
    const datePart = withoutPrefix.split('-').slice(0, 3).join('-');
    expect(datePart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('lowercases and slugifies the motivation', () => {
    const name = makeEvolutionBranchName('Agents', 'Fix NULL Check Bug');
    expect(name).toMatch(/fix-null-check-bug$/);
  });

  it('handles empty motivation with default suffix', () => {
    const name = makeEvolutionBranchName('scope', '');
    expect(name).toMatch(/-run$/);
  });

  it('truncates very long motivations', () => {
    const longMotivation = 'a'.repeat(200);
    const name = makeEvolutionBranchName('scope', longMotivation);
    // motivation slug should be at most 40 chars
    const parts = name.split('-');
    const slug = parts.slice(parts.length - 1)[0];
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it('sanitises special characters in scope', () => {
    const name = makeEvolutionBranchName('src/lib/foo', 'fix');
    expect(name).toMatch(/^evolution\/\d{4}-\d{2}-\d{2}-src-lib-foo-fix$/);
  });
});
