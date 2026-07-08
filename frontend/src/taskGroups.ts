export const TASK_GROUP_COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#be123c',
  '#4d7c0f',
] as const;

export const DEFAULT_TASK_GROUP_NAME = '업무';
export const DEFAULT_TASK_GROUP_COLOR = '#475569';

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function normalizeTaskGroupName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_TASK_GROUP_NAME;
  const trimmed = value.trim();
  return trimmed || DEFAULT_TASK_GROUP_NAME;
}

export function normalizeTaskGroupColor(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_TASK_GROUP_COLOR;
  const trimmed = value.trim();
  return isHexColor(trimmed) ? trimmed.toLowerCase() : DEFAULT_TASK_GROUP_COLOR;
}

export function pickTaskGroupColor(existingColors: readonly string[], random = Math.random): string {
  const used = new Set(existingColors.map((color) => normalizeTaskGroupColor(color).toLowerCase()));
  const available = TASK_GROUP_COLORS.filter((color) => !used.has(color.toLowerCase()));
  const candidates = available.length > 0 ? available : TASK_GROUP_COLORS;
  const index = Math.floor(random() * candidates.length) % candidates.length;
  return candidates[index];
}
