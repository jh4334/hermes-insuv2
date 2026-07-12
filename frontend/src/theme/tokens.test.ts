import { describe, expect, it } from 'vitest';
import {
  CALENDAR_TITLE_LIMIT,
  DEFAULT_GROUP_COLOR,
  MONTHS,
  WORKFLOW_CARD_STAGES,
  WORKFLOW_STAGES,
} from './tokens';

describe('theme tokens', () => {
  it('keeps calendar and workflow constants identical to the App baseline', () => {
    expect(MONTHS).toEqual(['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']);
    expect(CALENDAR_TITLE_LIMIT).toBe(10);
    expect(WORKFLOW_STAGES).toEqual(['계획', '심의·협의', '품의', '결과보고']);
    expect(WORKFLOW_CARD_STAGES).toEqual(['계획', '심의·협의', '품의', '결과보고']);
  });

  it('keeps fallback color value unchanged', () => {
    expect(DEFAULT_GROUP_COLOR).toBe('#9a0002');
  });
});
