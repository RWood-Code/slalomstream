import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Slalom Waterski Domain Logic
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
export const JUDGE_ROLES = ['judge_a', 'judge_b', 'boat_judge', 'judge_c', 'judge_d', 'judge_e', 'chief_judge'];

export function getJudgeRoles(judgeCount: number): string[] {
  if (judgeCount === 1) return ['judge_a'];
  if (judgeCount === 3) return ['judge_a', 'judge_b', 'boat_judge'];
  if (judgeCount === 5) return ['judge_a', 'judge_b', 'boat_judge', 'judge_d', 'judge_e'];
  return ['judge_a'];
}

export function scoreToNumber(score: string): number {
  if (score === '6_no_gates') return 6;
  const parsed = parseFloat(score);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatScoreDisplay(score: string | number | null | undefined): string {
  if (score === null || score === undefined) return '-';
  if (score === '6_no_gates') return '6 No Gates';
  return String(score);
}

export function collateScores(scores: string[]): number {
  if (scores.length === 0) return 0;
  const nums = scores.map(scoreToNumber).sort((a, b) => a - b);
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 0) {
    return (nums[mid - 1] + nums[mid]) / 2;
  }
  return nums[mid];
}

/**
 * IWWF official slalom rope loop colour coding (2026 rules)
 * Source: IWWF Waterski Rulebook, shortline loop identification
 *   23m  = neutral / no shortening  (white/none)
 *   18.25 = Red       (15 off)
 *   16    = Orange    (22 off)
 *   14.25 = Yellow    (28 off)
 *   13    = Green     (32 off)
 *   12    = Blue      (35 off)
 *   11.25 = Violet    (38 off)
 *   10.75 = no standard colour (silver/grey)
 *   10.25 = Pink      (41 off)
 *   9.75  = Black     (43 off)
 */
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
  if (!speed) return '-';
  return `${speed}kph`;
}
