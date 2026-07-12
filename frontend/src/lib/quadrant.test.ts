import { describe, expect, it } from 'vitest';
import { buildBundleQuadrants } from './quadrant';
import type { Task } from '../taskStorage';

const baseTask: Task = {
  id: 'base',
  title: '기본 업무',
  description: null,
  start_date: '2026-03-01',
  end_date: null,
  category: '계획',
  group_name: '교육과정',
  group_color: '#9a0002',
  priority: 'normal',
  source_doc: 'SAMPLE-001',
  owner: '담당자',
  reference_location: '공유드라이브/샘플',
  successor_memo: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function task(id: string, groupName: string, groupColor: string, startDate: string, category: string | null = '계획', overrides: Partial<Task> = {}): Task {
  return { ...baseTask, id, title: `${groupName} ${id}`, group_name: groupName, group_color: groupColor, start_date: startDate, category, ...overrides };
}

describe('bundle quadrant board', () => {
  it('uses absolute duration but relative local load for realistic school bundles', () => {
    const focusedHeavy = Array.from({ length: 10 }, (_, index) =>
      task(`focused-heavy-${index}`, '현장체험학습', '#9a0002', `2026-${String(3 + (index % 4)).padStart(2, '0')}-05`, index === 9 ? '결과보고' : '계획'),
    );
    const yearLight = Array.from({ length: 2 }, (_, index) =>
      task(`year-light-${index}`, '안전교육', '#2563eb', index === 0 ? '2026-01-10' : '2026-11-10', index === 1 ? '결과보고' : '계획', {
        end_date: index === 0 ? '2026-12-20' : undefined,
      }),
    );
    const focusedLight = [task('single-1', '도서관행사', '#9333ea', '2026-05-01', '결과보고')];
    const yearHeavy = Array.from({ length: 5 }, (_, index) =>
      task(`year-heavy-${index}`, '교육과정', '#16a34a', `2026-${String(1 + index * 2).padStart(2, '0')}-01`, index === 4 ? '결과보고' : '계획', {
        end_date: index === 0 ? '2026-10-30' : undefined,
      }),
    );

    const quadrants = buildBundleQuadrants([...focusedHeavy, ...yearLight, ...focusedLight, ...yearHeavy]);

    expect(quadrants.map((item) => item.groupName)).toEqual(['교육과정', '도서관행사', '안전교육', '현장체험학습']);
    expect(quadrants.find((item) => item.groupName === '현장체험학습')).toMatchObject({
      taskCount: 10,
      activeMonths: 4,
      periodBand: 'short-term',
      loadBand: 'high',
      quadrantLabel: '시기 집중 업무',
      hasMissingResultReport: false,
    });
    expect(quadrants.find((item) => item.groupName === '교육과정')).toMatchObject({
      taskCount: 5,
      activeMonths: 10,
      periodBand: 'long-term',
      loadBand: 'high',
      quadrantLabel: '연중 핵심 업무',
    });
    expect(quadrants.find((item) => item.groupName === '안전교육')).toMatchObject({
      taskCount: 2,
      activeMonths: 12,
      periodBand: 'long-term',
      loadBand: 'low',
      quadrantLabel: '꾸준히 관리',
    });
    expect(quadrants.find((item) => item.groupName === '도서관행사')).toMatchObject({
      taskCount: 1,
      activeMonths: 1,
      periodBand: 'short-term',
      loadBand: 'low',
      quadrantLabel: '단발성 업무',
    });
    expect(quadrants.every((item) => item.xPercent >= 8 && item.xPercent <= 92 && item.yPercent >= 8 && item.yPercent <= 92)).toBe(true);
    expect(quadrants.find((item) => item.groupName === '현장체험학습')?.xPercent).toBeLessThan(50);
    expect(quadrants.find((item) => item.groupName === '현장체험학습')?.yPercent).toBeGreaterThan(50);
    expect(new Set(quadrants.map((item) => item.quadrantLabel))).toEqual(new Set(['연중 핵심 업무', '시기 집중 업무', '꾸준히 관리', '단발성 업무']));
  });

  it('counts every month covered by a task date range without changing task data', () => {
    const quadrants = buildBundleQuadrants([
      task('range-1', '연중관리', '#9a0002', '2026-03-28', '계획', { end_date: '2026-05-02' }),
      task('short-1', '단기행사', '#2563eb', '2026-04-01', '결과보고'),
    ]);

    expect(quadrants.find((item) => item.groupName === '연중관리')).toMatchObject({
      taskCount: 1,
      activeMonths: 3,
      periodBand: 'short-term',
    });
  });

  it('keeps the horizontal period scale absolute so four active months stay focused', () => {
    const focusedHeavy = Array.from({ length: 10 }, (_, index) =>
      task(`focused-${index}`, '3-6월집중', '#2563eb', `2026-${String(3 + (index % 4)).padStart(2, '0')}-01`),
    );
    const shorter = [task('short-1', '하루행사', '#9333ea', '2026-05-01', '결과보고')];
    const yearRound = Array.from({ length: 2 }, (_, index) =>
      task(`year-${index}`, '연중관리', '#16a34a', index === 0 ? '2026-01-01' : '2026-11-01', index === 1 ? '결과보고' : '계획', {
        end_date: index === 0 ? '2026-12-20' : undefined,
      }),
    );

    const quadrants = buildBundleQuadrants([...focusedHeavy, ...shorter, ...yearRound]);
    const focused = quadrants.find((item) => item.groupName === '3-6월집중');
    const steady = quadrants.find((item) => item.groupName === '연중관리');

    expect(focused).toMatchObject({
      taskCount: 10,
      activeMonths: 4,
      periodBand: 'short-term',
      loadBand: 'high',
      quadrantLabel: '시기 집중 업무',
    });
    expect(focused?.xPercent).toBeLessThan(50);
    expect(focused?.yPercent).toBeGreaterThan(steady?.yPercent ?? 100);
    expect(steady).toMatchObject({
      activeMonths: 12,
      periodBand: 'long-term',
      quadrantLabel: '꾸준히 관리',
    });
    expect(steady?.xPercent).toBeGreaterThan(80);
  });

  it('keeps every above-median bundle visually above the center line even with skewed counts', () => {
    const tasks: Task[] = [
      task('one-1', '한건', '#9a0002', '2026-03-01'),
      ...Array.from({ length: 2 }, (_, index) => task(`two-${index}`, '두건', '#2563eb', `2026-04-${String(index + 1).padStart(2, '0')}`)),
      ...Array.from({ length: 3 }, (_, index) => task(`three-${index}`, '세건', '#16a34a', `2026-05-${String(index + 1).padStart(2, '0')}`)),
      ...Array.from({ length: 10 }, (_, index) => task(`ten-${index}`, '열건', '#9333ea', `2026-06-${String(index + 1).padStart(2, '0')}`)),
    ];

    const quadrants = buildBundleQuadrants(tasks);
    const three = quadrants.find((item) => item.groupName === '세건');
    const two = quadrants.find((item) => item.groupName === '두건');

    expect(three).toMatchObject({ taskCount: 3, loadBand: 'high', quadrantLabel: '시기 집중 업무' });
    expect(three?.yPercent).toBeGreaterThan(50);
    expect(two).toMatchObject({ taskCount: 2, loadBand: 'low', quadrantLabel: '단발성 업무' });
    expect(two?.yPercent).toBeLessThanOrEqual(50);
  });

  it('uses small offsets when bundle labels would otherwise overlap exactly', () => {
    const sameSpot = [
      task('a-1', '가꾸러미', '#9a0002', '2026-03-01'),
      task('b-1', '나꾸러미', '#2563eb', '2026-03-02'),
      task('c-1', '다꾸러미', '#16a34a', '2026-03-03'),
    ];

    const quadrants = buildBundleQuadrants(sameSpot);
    const positions = new Set(quadrants.map((item) => `${item.xPercent}:${item.yPercent}`));

    expect(positions.size).toBe(quadrants.length);
    expect(quadrants.every((item) => item.xPercent >= 8 && item.xPercent <= 92 && item.yPercent >= 8 && item.yPercent <= 92)).toBe(true);
  });

  it('places a single bundle near the upper middle because there is no local load comparison', () => {
    const focused = Array.from({ length: 10 }, (_, index) => ({
      ...baseTask,
      id: `official-${index}`,
      title: `공문 ${index}`,
      group_name: '공무',
      start_date: `2026-${String(3 + (index % 3)).padStart(2, '0')}-01`,
    }));

    const quadrants = buildBundleQuadrants(focused);

    expect(quadrants.find((item) => item.groupName === '공무')).toMatchObject({
      taskCount: 10,
      activeMonths: 3,
      periodBand: 'short-term',
      loadBand: 'high',
      quadrantLabel: '시기 집중 업무',
    });
    expect(quadrants[0].xPercent).toBeLessThan(50);
    expect(quadrants[0].yPercent).toBeGreaterThan(50);
  });
});

describe('심의·협의 stage in quadrants', () => {
  it('counts 심의·협의 cards toward the plan/approval axis like 계획 and 품의', () => {
    const base = {
      description: null, end_date: null, priority: 'normal' as const, source_doc: null,
      owner: null, successor_memo: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    };
    const committee = buildBundleQuadrants([
      { ...base, id: 'c1', title: '위원회 개최', start_date: '2026-03-01', category: '심의·협의', group_name: '급식', group_color: '#059669' },
    ]);
    const planned = buildBundleQuadrants([
      { ...base, id: 'p1', title: '계획 수립', start_date: '2026-03-01', category: '계획', group_name: '급식', group_color: '#059669' },
    ]);
    expect(committee[0].yPercent).toBe(planned[0].yPercent);
    expect(committee[0].xPercent).toBe(planned[0].xPercent);
  });
});
