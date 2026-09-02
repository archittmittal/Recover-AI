import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * RA-30 — `docs/TASKS.md` reported 83 of 83 tasks complete while task 8.3's "baseline comparison
 * harness" was two hardcoded constants and task 8.10 described a deployment that cannot boot.
 *
 * One verified false ✅ costs the other 82 rows their evidential weight. The board is only worth
 * keeping if its summary is derived from its rows, so that is asserted here rather than trusted:
 * the first corrected draft of that summary was itself wrong by one row.
 */

const STATUSES = ['✅', '🟡', '⬜', '❌'] as const;
type Status = (typeof STATUSES)[number];

interface PhaseCount {
  phase: string;
  total: number;
  counts: Record<Status, number>;
}

function parseBoard(markdown: string): PhaseCount[] {
  const phases: PhaseCount[] = [];
  let current: PhaseCount | null = null;

  for (const line of markdown.split('\n')) {
    const phaseHeading = line.match(/^## (Phase \d+[^\n]*)$/);
    if (phaseHeading) {
      current = {
        phase: phaseHeading[1].trim(),
        total: 0,
        counts: { '✅': 0, '🟡': 0, '⬜': 0, '❌': 0 },
      };
      phases.push(current);
      continue;
    }

    // A task row: | 8.3 | Task name | ✅ | Owner | Notes |
    //
    // The `u` flag is load-bearing: 🟡 is U+1F7E1, outside the BMP. Without it JavaScript reads
    // the character class as loose surrogate halves and silently fails to match every
    // in-progress row — which is how the first version of this test "passed" a board whose
    // Phase 8 was three rows short.
    const taskRow = line.match(/^\|\s*(\d+\.\d+)\s*\|[^|]*\|\s*([✅🟡⬜❌])\s*\|/u);
    if (taskRow && current) {
      current.total += 1;
      current.counts[taskRow[2] as Status] += 1;
    }
  }

  return phases;
}

/** The hand-written summary table, which is what has to agree with the rows. */
function parseSummary(markdown: string): { rows: number[][]; total: number[] } {
  const rows: number[][] = [];
  let total: number[] = [];

  for (const line of markdown.split('\n')) {
    const summaryRow = line.match(
      /^\|\s*Phase \d+:[^|]*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/
    );
    if (summaryRow) rows.push(summaryRow.slice(1, 5).map(Number));

    const totalRow = line.match(
      /^\|\s*\*\*Total\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|/
    );
    if (totalRow) total = totalRow.slice(1, 5).map(Number);
  }

  return { rows, total };
}

describe('RA-30 task board', () => {
  const markdown = fs.readFileSync('docs/TASKS.md', 'utf8');
  const phases = parseBoard(markdown);
  const summary = parseSummary(markdown);

  it('parses a board with phases and task rows', () => {
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.reduce((n, p) => n + p.total, 0)).toBeGreaterThan(50);
    expect(summary.rows).toHaveLength(phases.length);
    expect(summary.total).toHaveLength(4);
  });

  it('summarises each phase exactly as its rows count', () => {
    phases.forEach((phase, i) => {
      const [total, done, wip, todo] = summary.rows[i];
      expect([phase.phase, total], `${phase.phase}: total`).toEqual([phase.phase, phase.total]);
      expect([phase.phase, done], `${phase.phase}: done`).toEqual([phase.phase, phase.counts['✅']]);
      expect([phase.phase, wip], `${phase.phase}: in progress`).toEqual([
        phase.phase,
        phase.counts['🟡'],
      ]);
      expect([phase.phase, todo], `${phase.phase}: not started`).toEqual([
        phase.phase,
        phase.counts['⬜'],
      ]);
    });
  });

  it('totals the phases it lists', () => {
    const sum = (index: number) => summary.rows.reduce((n, row) => n + row[index], 0);
    expect(summary.total).toEqual([sum(0), sum(1), sum(2), sum(3)]);
  });

  /**
   * The specific rows RA-30 and RA-22 were about. These flip back to ✅ only when the work is
   * genuinely done, at which point this expectation is the thing that must be updated
   * deliberately — not the summary quietly drifting.
   */
  it('does not claim the unbuilt items are done', () => {
    const rowFor = (id: string) =>
      markdown.split('\n').find((line) => line.startsWith(`| ${id} |`)) ?? '';

    expect(rowFor('8.10'), 'hosted demo (RA-28)').not.toContain('✅');
    expect(rowFor('6.10'), 'pitch video (RA-27)').not.toContain('✅');
  });
});
