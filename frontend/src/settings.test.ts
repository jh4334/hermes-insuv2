import { beforeEach, describe, expect, it } from 'vitest';
import { ONLINE_HOLIDAYS_KEY, readOnlineHolidaysEnabled, writeOnlineHolidaysEnabled } from './settings';

describe('online holidays opt-in', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to off (offline-first: no external call without consent)', () => {
    expect(readOnlineHolidaysEnabled()).toBe(false);
  });

  it('round-trips the consent flag', () => {
    writeOnlineHolidaysEnabled(true);
    expect(readOnlineHolidaysEnabled()).toBe(true);
    writeOnlineHolidaysEnabled(false);
    expect(readOnlineHolidaysEnabled()).toBe(false);
  });

  it('treats unknown stored values as off', () => {
    localStorage.setItem(ONLINE_HOLIDAYS_KEY, 'true');
    expect(readOnlineHolidaysEnabled()).toBe(false);
  });
});
