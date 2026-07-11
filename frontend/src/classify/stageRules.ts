import { WORKFLOW_CARD_STAGES } from '../theme/tokens';
import type { WorkflowCardStage } from '../types';

export type StageSuggestion = {
  readonly stage: WorkflowCardStage | null;
  readonly confidence: number;
  readonly matchedKeyword: string | null;
};

const COMMITTEE_KEYWORDS = ['위원회', '심의회', '협의회', '협의체', '심의', '자문회의', '운영위'];
const RESULT_KEYWORDS = ['결과보고', '결과 보고', '실적보고', '결과', '실적', '정산', '만족도 조사 결과'];
const REQUISITION_KEYWORDS = ['품의', '구입', '구매', '집행', '지출', '계약', '예산 사용', '물품 선정'];
const PLAN_KEYWORDS = ['기본계획', '운영계획', '추진계획', '계획 수립', '계획', '수립'];
const WEAK_RESULT_KEYWORDS = ['보고'];

function findKeyword(title: string, keywords: readonly string[]): string | null {
  return keywords.find((keyword) => title.includes(keyword)) ?? null;
}

/**
 * 제목 키워드 규칙으로 단계(계획 → 심의·협의 → 품의 → 결과보고)를 제안한다.
 * 우선순위: 결과보고(명시) > 심의·협의(위원회) > 품의 > 계획 > 보고(약한 신호).
 * "위원회 개최 결과보고"처럼 겹치는 제목은 결과 쪽 키워드가 이긴다.
 */
export function suggestStageFromTitle(title: string): StageSuggestion {
  const trimmed = title.trim();
  if (!trimmed) return { stage: null, confidence: 0, matchedKeyword: null };

  const resultKeyword = findKeyword(trimmed, RESULT_KEYWORDS);
  if (resultKeyword) return { stage: '결과보고', confidence: 0.9, matchedKeyword: resultKeyword };

  const committeeKeyword = findKeyword(trimmed, COMMITTEE_KEYWORDS);
  if (committeeKeyword) return { stage: '심의·협의', confidence: 0.85, matchedKeyword: committeeKeyword };

  const requisitionKeyword = findKeyword(trimmed, REQUISITION_KEYWORDS);
  if (requisitionKeyword) return { stage: '품의', confidence: 0.85, matchedKeyword: requisitionKeyword };

  const planKeyword = findKeyword(trimmed, PLAN_KEYWORDS);
  if (planKeyword) return { stage: '계획', confidence: 0.85, matchedKeyword: planKeyword };

  const weakKeyword = findKeyword(trimmed, WEAK_RESULT_KEYWORDS);
  if (weakKeyword) return { stage: '결과보고', confidence: 0.55, matchedKeyword: weakKeyword };

  return { stage: null, confidence: 0, matchedKeyword: null };
}

/**
 * 이미 붙어 있는 단계 태그를 존중하되, 위원회 제목은 심의·협의로 승격한다.
 * (백엔드 V1 규칙은 심의·협의 단계를 모르기 때문에 여기서 보정한다.)
 */
export function resolveCardStage(title: string, existingStage: string | null | undefined): StageSuggestion {
  const suggestion = suggestStageFromTitle(title);
  if (suggestion.stage === '심의·협의') return suggestion;
  const existing = WORKFLOW_CARD_STAGES.find((stage) => stage === existingStage);
  if (existing) return { stage: existing, confidence: 1, matchedKeyword: null };
  return suggestion;
}
