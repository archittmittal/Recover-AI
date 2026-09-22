'use client';

import React from 'react';

/**
 * Marks which experiment arm a journey belongs to (RA-22).
 *
 * The batch seeds one customer into all three arms, so the records table holds up to three
 * rows per person. Without this the rows read as duplicated customers — the most common
 * "is your data broken?" question the dashboard invited.
 */
const ARM_INFO: Record<string, { label: string; title: string; className: string }> = {
  A: {
    label: 'A',
    title: 'Arm A · control — detected and recorded, never contacted',
    className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  },
  B: {
    label: 'B',
    title: 'Arm B · baseline — fixed cadence, one template, no LLM',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  },
  C: {
    label: 'C',
    title: 'Arm C · RecoverAI — classification, per-failure strategy, personalised copy',
    className: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
  },
};

export function ArmBadge({ arm }: { arm: string }) {
  const info = ARM_INFO[arm];
  if (!info) return null;

  return (
    <span
      title={info.title}
      className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-semibold uppercase tracking-wide ${info.className}`}
    >
      Arm {info.label}
    </span>
  );
}
