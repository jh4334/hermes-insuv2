export type HolidayLoadStatus = 'fixed-fallback' | 'cache-hit' | 'network-hit';

export type HolidayCalendar = {
  readonly dates: ReadonlySet<string>;
  readonly statusByYear: Readonly<Record<number, HolidayLoadStatus>>;
};

export const KOREAN_HOLIDAY_CACHE_PREFIX = 'handover:kr-public-holidays:v1:';

const FIXED_HOLIDAY_MONTH_DAYS = new Set(['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25']);
const AMBIGUOUS_SCHOOL_HOLIDAY_NAMES = ['labour day', 'labor day', '근로자의 날', '노동절', 'constitution day', '제헌절'];

type PublicHolidayApiItem = {
  readonly date?: unknown;
  readonly localName?: unknown;
  readonly name?: unknown;
};

type HolidayCachePayload = {
  readonly dates?: unknown;
  readonly cachedAt?: unknown;
};

function parseIsoDateParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function addDaysIso(value: string, days: number): string {
  const parts = parseIsoDateParts(value);
  if (!parts) return value;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

export function isKoreanFixedHoliday(value: string): boolean {
  const parts = parseIsoDateParts(value);
  if (!parts) return false;
  const monthDay = `${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return FIXED_HOLIDAY_MONTH_DAYS.has(monthDay);
}

export function isWeekend(value: string): boolean {
  const parts = parseIsoDateParts(value);
  if (!parts) return false;
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return day === 0 || day === 6;
}

export function isHolidayOrWeekend(value: string, holidays: ReadonlySet<string> = new Set()): boolean {
  return isWeekend(value) || holidays.has(value) || isKoreanFixedHoliday(value);
}

export function previousBusinessDay(value: string, holidays: ReadonlySet<string> = new Set()): string {
  let candidate = addDaysIso(value, -1);
  for (let i = 0; i < 14 && isHolidayOrWeekend(candidate, holidays); i += 1) {
    candidate = addDaysIso(candidate, -1);
  }
  return candidate;
}

export function toBusinessDayOnOrBefore(value: string, holidays: ReadonlySet<string> = new Set()): string {
  let candidate = value;
  for (let i = 0; i < 14 && isHolidayOrWeekend(candidate, holidays); i += 1) {
    candidate = addDaysIso(candidate, -1);
  }
  return candidate;
}

export function dateReviewSuggestion(value: string, holidays: ReadonlySet<string> = new Set()): { label: string; detail: string } | null {
  if (!isHolidayOrWeekend(value, holidays)) return null;
  return { label: '주말·공휴일 확인', detail: `직전 평일 확인: ${previousBusinessDay(value, holidays)}` };
}

function cacheKey(year: number): string {
  return `${KOREAN_HOLIDAY_CACHE_PREFIX}${year}`;
}

function shouldExcludeHoliday(item: PublicHolidayApiItem): boolean {
  const label = `${String(item.localName ?? '')} ${String(item.name ?? '')}`.toLowerCase();
  return AMBIGUOUS_SCHOOL_HOLIDAY_NAMES.some((name) => label.includes(name));
}

function normalizeApiDates(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return Array.from(new Set(items.flatMap((item) => {
    const holiday = item as PublicHolidayApiItem;
    if (typeof holiday.date !== 'string') return [];
    if (!parseIsoDateParts(holiday.date)) return [];
    if (shouldExcludeHoliday(holiday)) return [];
    return [holiday.date];
  }))).sort();
}

function readCachedDates(year: number, storage?: Storage): string[] | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(cacheKey(year));
    if (!raw) return null;
    const payload = JSON.parse(raw) as HolidayCachePayload;
    if (!Array.isArray(payload.dates)) return null;
    const dates = payload.dates.filter((date): date is string => typeof date === 'string' && parseIsoDateParts(date) !== null);
    return dates.length > 0 ? Array.from(new Set(dates)).sort() : null;
  } catch {
    return null;
  }
}

function writeCachedDates(year: number, dates: readonly string[], storage?: Storage) {
  if (!storage) return;
  try {
    storage.setItem(cacheKey(year), JSON.stringify({ dates, cachedAt: new Date().toISOString() }));
  } catch {
    // Cache is a convenience only. Keep the app usable when localStorage is full/unavailable.
  }
}

function fixedHolidayDatesForYear(year: number): string[] {
  return Array.from(FIXED_HOLIDAY_MONTH_DAYS).sort().map((monthDay) => `${year}-${monthDay}`);
}

export async function loadKoreanPublicHolidays(
  years: readonly number[],
  options: { fetchImpl?: typeof fetch; storage?: Storage; online?: boolean } = {},
): Promise<HolidayCalendar> {
  // offline-first: online이 false면 외부 API를 호출하지 않고 캐시+고정공휴일만 사용한다.
  const online = options.online ?? true;
  const fetchImpl = online ? (options.fetchImpl ?? globalThis.fetch?.bind(globalThis)) : undefined;
  const storage = options.storage ?? globalThis.localStorage;
  const uniqueYears = Array.from(new Set(years.filter((year) => Number.isInteger(year) && year >= 1900 && year <= 2200))).sort();
  const dates = new Set<string>();
  const statusByYear: Record<number, HolidayLoadStatus> = {};

  await Promise.all(uniqueYears.map(async (year) => {
    if (fetchImpl) {
      try {
        const response = await fetchImpl(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`);
        if (response.ok) {
          const payload = typeof response.clone === 'function' ? await response.clone().json() : await response.json();
          const apiDates = normalizeApiDates(payload);
          if (apiDates.length > 0) {
            apiDates.forEach((date) => dates.add(date));
            writeCachedDates(year, apiDates, storage);
            statusByYear[year] = 'network-hit';
            return;
          }
        }
      } catch {
        // Fall through to cache/fixed fallback.
      }
    }

    const cached = readCachedDates(year, storage);
    if (cached) {
      cached.forEach((date) => dates.add(date));
      statusByYear[year] = 'cache-hit';
      return;
    }

    fixedHolidayDatesForYear(year).forEach((date) => dates.add(date));
    statusByYear[year] = 'fixed-fallback';
  }));

  return { dates, statusByYear };
}
