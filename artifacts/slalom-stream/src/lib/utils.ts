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
export const DIVISIONS = ['Open Men', 'Open Women', 'Pro Men', 'Pro Women', 'U17 Boys', 'U17 Girls', 'U21 Men', 'U21 Women', 'O35 Men', 'O35 Women', 'Amateur'];
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

export function formatRope(rope: number): string {
  return `${rope}m`;
}

export function formatSpeed(speed: number | null | undefined): string {
  if (!speed) return '-';
  return `${speed}kph`;
}
