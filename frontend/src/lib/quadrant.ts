import { normalizeTaskGroupName } from '../taskGroups';
import type { Task } from '../taskStorage';
import { normalizeWorkflowCardStage } from './format';

export type BundleQuadrantBand = 'short-term' | 'mid-term' | 'long-term';
export type BundleLoadBand = 'low' | 'high';
export type BundleQuadrantLabel = '연중 핵심 업무' | '시기 집중 업무' | '꾸준히 관리' | '단발성 업무';

export type BundleQuadrant = {
  readonly groupName: string;
  readonly groupColor: string;
  readonly taskCount: number;
  readonly activeMonths: number;
  readonly periodBand: BundleQuadrantBand;
  readonly loadBand: BundleLoadBand;
  readonly quadrantLabel: BundleQuadrantLabel;
  readonly xPercent: number;
  readonly yPercent: number;
  readonly hasMissingResultReport: boolean;
};

type BundleAccumulator = {
  groupName: string;
  groupColor: string;
  taskCount: number;
  months: Set<string>;
  planOrApprovalCount: number;
  resultCount: number;
};

function clampMapPercent(value: number): number {
  return Math.max(8, Math.min(92, Math.round(value)));
}

function scaledPercent(value: number, min: number, max: number): number {
  if (max <= min) return 50;
  return clampMapPercent(8 + ((value - min) / (max - min)) * 84);
}

function scaledPercentAroundCenter(value: number, min: number, center: number, max: number): number {
  if (max <= min) return 50;
  if (value === center) return 50;
  if (value < center) {
    if (center <= min) return 50;
    return clampMapPercent(8 + ((value - min) / (center - min)) * 42);
  }
  if (max <= center) return 50;
  return clampMapPercent(50 + ((value - center) / (max - center)) * 42);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function offsetOverlappingLabels<T extends { xPercent: number; yPercent: number }>(items: readonly T[]): T[] {
  const seen = new Map<string, number>();
  const offsets = [
    [0, 0],
    [6, 4],
    [6, -4],
    [-6, 4],
    [-6, -4],
    [0, 8],
    [0, -8],
  ];
  return items.map((item) => {
    const key = `${Math.round(item.xPercent)}:${Math.round(item.yPercent)}`;
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    if (index === 0) return item;
    const [xOffset, yOffset] = offsets[index % offsets.length];
    return {
      ...item,
      xPercent: clampMapPercent(item.xPercent + xOffset),
      yPercent: clampMapPercent(item.yPercent + yOffset),
    };
  });
}

function quadrantLabel(periodBand: BundleQuadrantBand, loadBand: BundleLoadBand): BundleQuadrantLabel {
  if (periodBand === 'long-term' && loadBand === 'high') return '연중 핵심 업무';
  if (loadBand === 'high') return '시기 집중 업무';
  if (periodBand === 'long-term') return '꾸준히 관리';
  return '단발성 업무';
}

function monthKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value.slice(0, 7);
}

function addActiveMonths(months: Set<string>, startDate: string, endDate: string | null | undefined) {
  const startKey = monthKey(startDate);
  if (!startKey) return;
  const endKey = monthKey(endDate) ?? startKey;
  let [year, month] = startKey.split('-').map(Number);
  const [endYear, endMonth] = endKey < startKey ? [year, month] : endKey.split('-').map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.add(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

export function buildBundleQuadrants(tasks: readonly Task[]): BundleQuadrant[] {
  const map = new Map<string, BundleAccumulator>();
  for (const task of tasks) {
    const groupName = normalizeTaskGroupName(task.group_name);
    const current = map.get(groupName) ?? {
      groupName,
      groupColor: task.group_color,
      taskCount: 0,
      months: new Set<string>(),
      planOrApprovalCount: 0,
      resultCount: 0,
    };
    current.taskCount += 1;
    addActiveMonths(current.months, task.start_date, task.end_date);
    const stage = normalizeWorkflowCardStage(task.category);
    if (stage === '계획' || stage === '품의') current.planOrApprovalCount += 1;
    if (stage === '결과보고') current.resultCount += 1;
    if (!current.groupColor && task.group_color) current.groupColor = task.group_color;
    map.set(groupName, current);
  }

  const groups = Array.from(map.values());
  if (groups.length === 0) return [];
  const taskCounts = groups.map((group) => group.taskCount);
  const minTaskCount = Math.min(...taskCounts);
  const maxTaskCount = Math.max(...taskCounts);
  const loadMedian = median(taskCounts);
  const hasComparableLoad = groups.length > 1 && minTaskCount !== maxTaskCount;

  const quadrants = groups
    .map((group) => {
      const activeMonths = group.months.size;
      const periodBand: BundleQuadrantBand = activeMonths >= 10 ? 'long-term' : activeMonths <= 7 ? 'short-term' : 'mid-term';
      const loadBand: BundleLoadBand = !hasComparableLoad ? (groups.length === 1 ? 'high' : 'low') : group.taskCount > loadMedian ? 'high' : 'low';
      const yPercent = !hasComparableLoad ? (groups.length === 1 ? 72 : 50) : scaledPercentAroundCenter(group.taskCount, minTaskCount, loadMedian, maxTaskCount);
      return {
        groupName: group.groupName,
        groupColor: group.groupColor,
        taskCount: group.taskCount,
        activeMonths,
        periodBand,
        loadBand,
        quadrantLabel: quadrantLabel(periodBand, loadBand),
        xPercent: scaledPercent(Math.max(activeMonths, 1), 1, 12),
        yPercent,
        hasMissingResultReport: group.planOrApprovalCount > 0 && group.resultCount === 0,
      };
    })
    .sort((a, b) => a.groupName.localeCompare(b.groupName, 'ko'));

  return offsetOverlappingLabels(quadrants);
}
