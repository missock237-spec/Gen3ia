/**
 * Comparateur de code — Diff et analyse de versions
 * 
 * Permet de comparer deux sessions, executions ou 
 * versions de code cote a cote avec coloration.
 */

export interface CodeDiff {
  linesAdded: number;
  linesRemoved: number;
  linesChanged: number;
  changes: DiffLine[];
  summary: string;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'modified';
  oldLine?: number;
  newLine?: number;
  oldContent?: string;
  newContent?: string;
  content?: string;
}

export interface VersionSnapshot {
  id: string;
  sessionId: string;
  code: string;
  language: string;
  output: string;
  duration: number;
  success: boolean;
  timestamp: Date;
  label?: string;
}

/**
 * Calcule le diff entre deux codes
 */
export function diffCode(oldCode: string, newCode: string): CodeDiff {
  const oldLines = oldCode.split('\n');
  const newLines = newCode.split('\n');
  const changes: DiffLine[] = [];

  let added = 0, removed = 0, changed = 0;
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === undefined && newLine !== undefined) {
      changes.push({ type: 'added', newLine: i + 1, content: newLine });
      added++;
    } else if (oldLine !== undefined && newLine === undefined) {
      changes.push({ type: 'removed', oldLine: i + 1, content: oldLine });
      removed++;
    } else if (oldLine !== newLine) {
      changes.push({ type: 'modified', oldLine: i + 1, newLine: i + 1, oldContent: oldLine, newContent: newLine });
      changed++;
    } else {
      changes.push({ type: 'unchanged', line: i + 1, content: oldLine });
    }
  }

  return {
    linesAdded: added,
    linesRemoved: removed,
    linesChanged: changed,
    changes,
    summary: `${added} ajoutees, ${removed} supprimees, ${changed} modifiees`,
  };
}

/**
 * Calcule les stats entre deux versions
 */
export function compareVersions(oldVersion: VersionSnapshot, newVersion: VersionSnapshot) {
  const diff = diffCode(oldVersion.code, newVersion.code);
  const durationDiff = newVersion.duration - oldVersion.duration;
  const speedChange = durationDiff !== 0
    ? Math.round((oldVersion.duration / newVersion.duration) * 100 - 100)
    : 0;

  return {
    diff,
    duration: {
      old: oldVersion.duration,
      new: newVersion.duration,
      change: durationDiff,
      percent: speedChange,
      faster: speedChange > 0,
    },
    success: {
      old: oldVersion.success,
      new: newVersion.success,
      improved: !oldVersion.success && newVersion.success,
    },
    lines: {
      old: oldVersion.code.split('\n').length,
      new: newVersion.code.split('\n').length,
    },
    timeBetween: newVersion.timestamp.getTime() - oldVersion.timestamp.getTime(),
  };
}

/**
 * Genere un rapport de comparaison lisible
 */
export function generateComparisonReport(oldVersion: VersionSnapshot, newVersion: VersionSnapshot): string {
  const comparison = compareVersions(oldVersion, newVersion);
  const lines: string[] = [];

  lines.push('=== COMPARAISON DE VERSIONS ===');
  lines.push('');
  lines.push('Ancienne: ' + (oldVersion.label || oldVersion.id) + ' (' + oldVersion.timestamp.toLocaleString() + ')');
  lines.push('Nouvelle: ' + (newVersion.label || newVersion.id) + ' (' + newVersion.timestamp.toLocaleString() + ')');
  lines.push('');
  lines.push('Diff:');
  lines.push('  ' + comparison.diff.summary);
  lines.push('');
  lines.push('Performance:');
  if (comparison.duration.old > 0) {
    const sign = comparison.duration.faster ? '+' : '-';
    lines.push('  Ancien: ' + comparison.duration.old + 'ms');
    lines.push('  Nouveau: ' + comparison.duration.new + 'ms');
    lines.push('  Evolution: ' + sign + Math.abs(comparison.duration.percent) + '%');
  }
  lines.push('');
  if (comparison.success.improved) {
    lines.push('✅ Statut ameliore: echec → succes');
  }
  lines.push('');
  lines.push('Lignes de code: ' + comparison.lines.old + ' → ' + comparison.lines.new);

  return lines.join('\n');
}

/**
 * Cree un snapshot de version
 */
export function createSnapshot(
  sessionId: string,
  code: string,
  language: string,
  output: string,
  duration: number,
  success: boolean,
  label?: string
): VersionSnapshot {
  return {
    id: 'snap_' + Date.now().toString(36),
    sessionId,
    code,
    language,
    output,
    duration,
    success,
    timestamp: new Date(),
    label,
  };
}

/**
 * Stockage des snapshots
 */
const snapshots = new Map<string, VersionSnapshot[]>();

export function saveSnapshot(sessionId: string, snapshot: VersionSnapshot): void {
  const list = snapshots.get(sessionId) || [];
  list.push(snapshot);
  snapshots.set(sessionId, list);
}

export function getSnapshots(sessionId: string): VersionSnapshot[] {
  return snapshots.get(sessionId) || [];
}

export function compareSnapshots(sessionId: string, oldIndex: number, newIndex: number) {
  const list = snapshots.get(sessionId);
  if (!list || oldIndex >= list.length || newIndex >= list.length) {
    throw new Error('Snapshots invalides');
  }
  return compareVersions(list[oldIndex], list[newIndex]);
}