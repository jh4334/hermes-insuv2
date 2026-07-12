import { describe, expect, it } from 'vitest';
import { extractProjectName } from './projects';

describe('extractProjectName', () => {
  it('extracts 주간-style project names from titles', () => {
    expect(extractProjectName('2026 통일교육주간 운영 계획')).toBe('통일교육주간');
    expect(extractProjectName('학교폭력예방 캠페인 실시 안내')).toBeNull();
    expect(extractProjectName('학교폭력예방캠페인 실시 안내')).toBe('학교폭력예방캠페인');
  });

  it('extracts 대회/골든벨-style project names', () => {
    expect(extractProjectName('독도 골든벨 참가 신청')).toBeNull();
    expect(extractProjectName('독도골든벨 참가 신청')).toBe('독도골든벨');
    expect(extractProjectName('과학탐구대회 결과보고')).toBe('과학탐구대회');
  });

  it('returns null when no project-like token exists', () => {
    expect(extractProjectName('안전교육 기본계획 수립')).toBeNull();
    expect(extractProjectName('주간 업무 보고')).toBeNull();
  });
});
