import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Slalom Domain Constants ───────────────────────────────────────────────────
export const VALID_IWWF_SCORES = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6', '6_no_gates'];
export const ROPE_LENGTHS = [23, 18.25, 16, 14.25, 13, 12, 11.25, 10.75, 10.25, 9.75];
export const SPEEDS = [34, 37, 40, 43, 46, 49, 52, 55, 58];
export const TOURNAMENT_CLASSES = ['G', 'L', 'R', 'E', 'EMS'];
export const DIVISIONS = [
  'Open Men', 'Open Women',
  'Pro Men', 'Pro Women',
  'U17 Boys', 'U17 Girls',
  'U21 Men', 'U21 Women',
  'O35 Men', 'O35 Women',
  'O45 Men', 'O45 Women',
  'O55 Men', 'O55 Women',
  'O65 Men', 'O65 Women',
  'Amateur',
];

// ─── Judging Panel Logic ───────────────────────────────────────────────────────
// IWWF slalom panels: 1, 3, or 5 judges.
// The highest-numbered judge in the panel is also the Boat Judge.
// With 1 judge, Judge A is also Chief Judge and Boat Judge.

export type PanelStation = {
  role: string;
  label: string;       // e.g. "Judge A", "Judge C / Boat"
  shortLabel: string;  // e.g. "A", "C"
  isBoat: boolean;
  isChiefOnly: boolean; // true only for the standalone chief_judge role
};

/** Returns the scoring stations for a panel of the given size. */
export function getJudgingPanel(judgeCount: number): PanelStation[] {
  const count = judgeCount <= 1 ? 1 : judgeCount <= 3 ? 3 : 5;
  const letters = ['A', 'B', 'C', 'D', 'E'];

  return Array.from({ length: count }, (_, i) => {
    const isLast = i === count - 1;
    const isBoat = count > 1 && isLast;
    const letter = letters[i];
    return {
      role: `judge_${letter.toLowerCase()}`,
      label: isBoat ? `Judge ${letter} / Boat` : `Judge ${letter}`,
      shortLabel: letter,
      isBoat,
      isChiefOnly: false,
    };
  });
}

/** The roles whose scores are counted in the scoring collation. */
export const SCORING_ROLES = ['judge_a', 'judge_b', 'judge_c', 'judge_d', 'judge_e'];

export function getScoringRoles(judgeCount: number): string[] {
  return SCORING_ROLES.slice(0, Math.min(Math.max(judgeCount, 1), 5));
}

/** All possible judge roles (scoring + oversight). */
export const JUDGE_ROLES = [...SCORING_ROLES, 'chief_judge'];

// ─── Scoring Maths ────────────────────────────────────────────────────────────
export function scoreToNumber(score: string): number {
  if (score === '6_no_gates') return 6;
  const parsed = parseFloat(score);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatScoreDisplay(score: string | number | null | undefined): string {
  if (score === null || score === undefined) return '—';
  if (score === '6_no_gates') return '6 No Gates';
  return String(score);
}

/** IWWF median collation — works for any panel size. */
export function collateScores(scores: string[]): number {
  if (scores.length === 0) return 0;
  const nums = scores.map(scoreToNumber).sort((a, b) => a - b);
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 0) {
    return (nums[mid - 1] + nums[mid]) / 2;
  }
  return nums[mid];
}

// ─── Rope colour coding (IWWF 2026) ───────────────────────────────────────────
export const ROPE_COLOURS: Record<number, { bg: string; text: string; border: string; label: string }> = {
  23:    { bg: '#f8fafc', text: '#475569', border: '#cbd5e1', label: 'Full' },
  18.25: { bg: '#fef2f2', text: '#dc2626', border: '#ef4444', label: 'Red' },
  16:    { bg: '#fff7ed', text: '#ea580c', border: '#f97316', label: 'Orange' },
  14.25: { bg: '#fefce8', text: '#ca8a04', border: '#eab308', label: 'Yellow' },
  13:    { bg: '#f0fdf4', text: '#16a34a', border: '#22c55e', label: 'Green' },
  12:    { bg: '#eff6ff', text: '#2563eb', border: '#3b82f6', label: 'Blue' },
  11.25: { bg: '#f5f3ff', text: '#7c3aed', border: '#8b5cf6', label: 'Violet' },
  10.75: { bg: '#f1f5f9', text: '#64748b', border: '#94a3b8', label: 'Silver' },
  10.25: { bg: '#fdf2f8', text: '#db2777', border: '#ec4899', label: 'Pink' },
  9.75:  { bg: '#0f172a', text: '#f8fafc', border: '#334155', label: 'Black' },
};

export function getRopeColour(rope: number) {
  return ROPE_COLOURS[rope] ?? { bg: '#f8fafc', text: '#475569', border: '#cbd5e1', label: `${rope}m` };
}

export function formatRope(rope: number): string {
  return `${rope}m`;
}

export function formatSpeed(speed: number | null | undefined): string {
  if (!speed) return '—';
  return `${speed}kph`;
}

/**
 * Suggest the next rope length based on the skier's last pass.
 * IWWF progression: if the skier completed a full pass (6 buoys), shorten rope.
 * Otherwise repeat the same rope.
 */
export function suggestNextRope(lastPass: { buoys_scored: number | null; rope_length: number } | null): number | null {
  if (!lastPass) return null;
  if ((lastPass.buoys_scored ?? 0) >= 6) {
    const idx = ROPE_LENGTHS.indexOf(lastPass.rope_length);
    if (idx >= 0 && idx < ROPE_LENGTHS.length - 1) return ROPE_LENGTHS[idx + 1];
  }
  return lastPass.rope_length;
}
