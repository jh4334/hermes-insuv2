import type { Task } from '../taskStorage';
import { MONTHS } from '../theme/tokens';
import type { CalendarMonth } from '../types';

export function localDateIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export type MonthGridDate = {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  monthPosition: 'previous' | 'current' | 'next';
};

export function buildMonthGridDates(year: number, monthIndex: number): MonthGridDate[] {
  const firstDayOffset = new Date(year, monthIndex, 1).getDay();
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, monthIndex, 1 - firstDayOffset + index);
    const gridYear = date.getFullYear();
    const gridMonthIndex = date.getMonth();
    const day = date.getDate();
    const isCurrentMonth = gridYear === year && gridMonthIndex === monthIndex;
    const monthPosition: MonthGridDate['monthPosition'] = isCurrentMonth
      ? 'current'
      : gridYear < year || (gridYear === year && gridMonthIndex < monthIndex)
        ? 'previous'
        : 'next';
    return {
      date: `${gridYear}-${String(gridMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      day,
      isCurrentMonth,
      monthPosition,
    };
  });
}

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function addDaysIso(value: string, days: number): string {
  if (!isValidIsoDate(value)) return value;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

export function extractTaskYear(value: string): number | null {
  if (!isValidIsoDate(value)) return null;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : null;
}

export function holidayYearsForTasks(tasks: Task[]): number[] {
  const years = new Set<number>();
  tasks.forEach((task) => {
    const year = extractTaskYear(task.start_date);
    if (!year) return;
    years.add(year - 1);
    years.add(year);
    years.add(year + 1);
  });
  return [...years].sort();
}

export function buildCalendarMonths(year: number): CalendarMonth[] {
  return Array.from({ length: 14 }, (_, index) => {
    const monthIndex = index % 12;
    const calendarYear = year + Math.floor(index / 12);
    return {
      year: calendarYear,
      monthIndex,
      label: MONTHS[monthIndex],
      key: `${calendarYear}-${String(monthIndex + 1).padStart(2, '0')}`,
    };
  });
}

export function isInCalendarRange(task: Pick<Task, 'start_date'>, year: number) {
  if (!isValidIsoDate(task.start_date)) return false;
  return task.start_date >= `${year}-01-01` && task.start_date < `${year + 1}-03-01`;
}
