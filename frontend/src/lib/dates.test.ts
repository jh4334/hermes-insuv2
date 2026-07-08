import { describe, expect, it } from 'vitest';
import type { Task } from '../taskStorage';
import {
  addDaysIso,
  buildCalendarMonths,
  daysInMonth,
  extractTaskYear,
  holidayYearsForTasks,
  isInCalendarRange,
  isValidIsoDate,
  localDateIso,
} from './dates';

const task = (startDate: string): Task => ({
  id: `task-${startDate}`,
  title: '학교 안전 점검 계획 안내',
  description: '업무 카드 메모',
  start_date: startDate,
  end_date: null,
  category: '계획',
  group_name: '안전',
  group_color: '#dc2626',
  priority: 'normal',
  source_doc: '업무지원과-0000',
  owner: '담당자 확인',
  reference_location: 'K-에듀파인 또는 공문함',
  successor_memo: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
});

describe('date helpers', () => {
  it('formats local dates and month lengths with the App baseline behavior', () => {
    expect(localDateIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2024, 1)).toBe(29);
  });

  it('validates strict real ISO calendar dates without repairing malformed imports', () => {
    expect(isValidIsoDate('2026-03-01')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2026-12-31')).toBe(true);

    for (const value of [
      '2026-99-99',
      '2026-02-31',
      '2026-13-01',
      '2026-00-10',
      '2023-02-29',
      '2026-2-3',
      '2026/02/03',
      '20260203',
      '',
      undefined,
      null,
      20260301,
    ]) {
      expect(isValidIsoDate(value)).toBe(false);
    }
  });

  it('adds ISO days using UTC math and leaves malformed values unchanged', () => {
    expect(addDaysIso('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysIso('not-a-date', 1)).toBe('not-a-date');
    expect(addDaysIso('2026-02-31', 1)).toBe('2026-02-31');
  });

  it('extracts only valid task years and builds adjacent holiday lookup years', () => {
    expect(extractTaskYear('2026-05-11')).toBe(2026);
    expect(extractTaskYear('1899-12-31')).toBeNull();
    expect(extractTaskYear('bad-date')).toBeNull();
    expect(extractTaskYear('2026-99-99')).toBeNull();
    expect(holidayYearsForTasks([task('2026-05-11'), task('2026-11-01'), task('2026-99-99')])).toEqual([2025, 2026, 2027]);
  });

  it('builds the 14-month calendar window used by the annual board', () => {
    const months = buildCalendarMonths(2026);

    expect(months).toHaveLength(14);
    expect(months[0]).toEqual({ year: 2026, monthIndex: 0, label: '1월', key: '2026-01' });
    expect(months[13]).toEqual({ year: 2027, monthIndex: 1, label: '2월', key: '2027-02' });
  });

  it('keeps tasks in the current school-year calendar range through next February', () => {
    expect(isInCalendarRange(task('2026-01-01'), 2026)).toBe(true);
    expect(isInCalendarRange(task('2027-02-28'), 2026)).toBe(true);
    expect(isInCalendarRange(task('2025-12-31'), 2026)).toBe(false);
    expect(isInCalendarRange(task('2027-03-01'), 2026)).toBe(false);
    expect(isInCalendarRange(task('2026-99-99'), 2026)).toBe(false);
  });
});
