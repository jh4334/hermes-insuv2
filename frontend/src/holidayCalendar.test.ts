import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KOREAN_HOLIDAY_CACHE_PREFIX,
  dateReviewSuggestion,
  loadKoreanPublicHolidays,
  toBusinessDayOnOrBefore,
} from './holidayCalendar';

const storage = new Map<string, string>();
const fakeStorage = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  removeItem: vi.fn((key: string) => storage.delete(key)),
  clear: vi.fn(() => storage.clear()),
  key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
  get length() {
    return storage.size;
  },
} as Storage;

function holidayResponse(items: unknown[]) {
  return Promise.resolve(new Response(JSON.stringify(items), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

describe('Korean public holiday calendar', () => {
  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  it('fetches Nager.Date KR holidays and caches normalized school-relevant dates', async () => {
    const fetchImpl = vi.fn(() => holidayResponse([
      { date: '2026-02-16', localName: '설날', name: 'Lunar New Year' },
      { date: '2026-02-17', localName: '설날', name: 'Lunar New Year' },
      { date: '2026-05-01', localName: '노동절', name: 'Labour Day' },
      { date: '2026-07-17', localName: '제헌절', name: 'Constitution Day' },
      { date: 'invalid', localName: '잘못된 날짜', name: 'Bad' },
    ])) as unknown as typeof fetch;

    const result = await loadKoreanPublicHolidays([2026], { fetchImpl, storage: fakeStorage });

    expect(fetchImpl).toHaveBeenCalledWith('https://date.nager.at/api/v3/PublicHolidays/2026/KR');
    expect(result.dates.has('2026-02-16')).toBe(true);
    expect(result.dates.has('2026-02-17')).toBe(true);
    expect(result.dates.has('2026-05-01')).toBe(false);
    expect(result.dates.has('2026-07-17')).toBe(false);
    expect(result.statusByYear[2026]).toBe('network-hit');
    const cached = JSON.parse(storage.get(`${KOREAN_HOLIDAY_CACHE_PREFIX}2026`) ?? '{}');
    expect(cached.dates).toEqual(['2026-02-16', '2026-02-17']);
  });

  it('uses localStorage cache when the public holiday API is unavailable', async () => {
    storage.set(`${KOREAN_HOLIDAY_CACHE_PREFIX}2026`, JSON.stringify({ dates: ['2026-02-16'], cachedAt: '2026-01-01T00:00:00.000Z' }));
    const fetchImpl = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;

    const result = await loadKoreanPublicHolidays([2026], { fetchImpl, storage: fakeStorage });

    expect(result.dates.has('2026-02-16')).toBe(true);
    expect(result.statusByYear[2026]).toBe('cache-hit');
  });

  it('falls back to fixed holidays when network and cache are unavailable', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;

    const result = await loadKoreanPublicHolidays([2026], { fetchImpl, storage: fakeStorage });

    expect(result.dates.has('2026-05-05')).toBe(true);
    expect(result.dates.has('2026-02-16')).toBe(false);
    expect(result.statusByYear[2026]).toBe('fixed-fallback');
  });

  it('moves business-day suggestions away from API-only lunar holidays', () => {
    const holidays = new Set(['2026-02-16', '2026-02-17', '2026-02-18']);

    expect(toBusinessDayOnOrBefore('2026-02-16', holidays)).toBe('2026-02-13');
    expect(dateReviewSuggestion('2026-02-16', holidays)?.detail).toContain('2026-02-13');
  });
});
