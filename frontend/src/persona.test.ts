import { beforeEach, describe, expect, it } from 'vitest';
import { PERSONA_COPY, PERSONA_KEY, readPersonaMode, writePersonaMode } from './persona';

describe('persona mode storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null before the user picks a track (onboarding trigger)', () => {
    expect(readPersonaMode()).toBeNull();
  });

  it('round-trips both persona modes', () => {
    writePersonaMode('giver');
    expect(readPersonaMode()).toBe('giver');
    writePersonaMode('receiver');
    expect(readPersonaMode()).toBe('receiver');
  });

  it('rejects unknown stored values', () => {
    localStorage.setItem(PERSONA_KEY, 'admin');
    expect(readPersonaMode()).toBeNull();
  });
});

describe('persona copy', () => {
  it('gives each track its own default view and one-line onboarding sentence', () => {
    expect(PERSONA_COPY.giver.defaultView).toBe('structure');
    expect(PERSONA_COPY.receiver.defaultView).toBe('calendar');
    expect(PERSONA_COPY.giver.oneLiner).not.toBe(PERSONA_COPY.receiver.oneLiner);
  });
});
