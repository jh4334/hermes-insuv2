import { describe, expect, it } from 'vitest';
import { detectReworkLoop, resolveCardStage, suggestStageFromTitle } from './stageRules';

describe('suggestStageFromTitle', () => {
  it('classifies plan titles as 계획', () => {
    const result = suggestStageFromTitle('2025학년도 안전교육 추진계획 수립');
    expect(result.stage).toBe('계획');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('classifies committee titles as 심의·협의', () => {
    const result = suggestStageFromTitle('학교교육과정위원회 개최 알림');
    expect(result.stage).toBe('심의·협의');
    expect(result.matchedKeyword).toBe('위원회');
  });

  it('classifies requisition titles as 품의', () => {
    expect(suggestStageFromTitle('통일교육주간 운영 물품 구입 품의').stage).toBe('품의');
    expect(suggestStageFromTitle('현장체험학습 버스 계약 요청').stage).toBe('품의');
  });

  it('classifies result titles as 결과보고 and beats committee keywords', () => {
    expect(suggestStageFromTitle('안전교육 실시 결과보고').stage).toBe('결과보고');
    expect(suggestStageFromTitle('학교폭력대책심의위원회 개최 결과 보고').stage).toBe('결과보고');
  });

  it('treats bare 보고 as a weak 결과보고 signal', () => {
    const result = suggestStageFromTitle('현황 보고 제출');
    expect(result.stage).toBe('결과보고');
    expect(result.confidence).toBeLessThan(0.8);
  });

  it('returns null when nothing matches', () => {
    const result = suggestStageFromTitle('교직원 명단');
    expect(result.stage).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

describe('detectReworkLoop', () => {
  it('detects 반려/재기안-style rework titles', () => {
    expect(detectReworkLoop('현장체험학습 계획 반려에 따른 재기안')).toBe(true);
    expect(detectReworkLoop('예산 품의 보완 제출')).toBe(true);
    expect(detectReworkLoop('안전교육 운영 계획')).toBe(false);
  });
});

describe('resolveCardStage', () => {
  it('keeps an existing valid stage tag', () => {
    const result = resolveCardStage('현장체험학습 어쩌구', '품의');
    expect(result.stage).toBe('품의');
    expect(result.confidence).toBe(1);
  });

  it('promotes committee titles to 심의·협의 even when a stage tag exists', () => {
    expect(resolveCardStage('학교운영위원회 심의 안건 제출', '계획').stage).toBe('심의·협의');
  });

  it('falls back to title rules when the existing stage is unknown', () => {
    expect(resolveCardStage('독서교육 운영계획', '예산검토').stage).toBe('계획');
  });
});
