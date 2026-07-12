import { buildBuckets } from './engine';
import type { CardClassification, ClassifyResult } from './engine';
import { WORKFLOW_CARD_STAGES } from '../theme/tokens';
import type { WorkflowCardStage } from '../types';

/**
 * 온라인 LLM 분류 (기획 문서 §4·§8) — 명시적 옵트인.
 * 켜져 있을 때만 공문 '제목만' 백엔드(/api/classify-llm)로 보내고,
 * 백엔드는 Claude로 업무/세부업무/단계 후보를 만들어 돌려준다.
 * 서버에 키가 없거나 요청이 실패하면 조용히 오프라인 규칙 분류로 폴백한다.
 */

export const ONLINE_LLM_KEY = 'handover:online-llm:v1';

export type LlmSuggestion = {
  readonly index: number;
  readonly job: string;
  readonly group: string;
  readonly stage: string | null;
};

export function readOnlineLlmEnabled(): boolean {
  try {
    return localStorage.getItem(ONLINE_LLM_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeOnlineLlmEnabled(enabled: boolean): void {
  localStorage.setItem(ONLINE_LLM_KEY, enabled ? 'on' : 'off');
}

/** 제목만 전송한다. 실패하면 null(오프라인 폴백 신호). */
export async function fetchLlmSuggestions(titles: readonly string[]): Promise<LlmSuggestion[] | null> {
  try {
    const response = await fetch('/api/classify-llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titles }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { results?: unknown };
    if (!Array.isArray(payload.results)) return null;
    return payload.results.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const record = item as Record<string, unknown>;
      if (typeof record.index !== 'number') return [];
      return [{
        index: record.index,
        job: typeof record.job === 'string' ? record.job.trim() : '',
        group: typeof record.group === 'string' ? record.group.trim() : '',
        stage: typeof record.stage === 'string' ? record.stage : null,
      }];
    });
  } catch {
    return null;
  }
}

/**
 * LLM 제안을 오프라인 분류 결과에 병합한다.
 * 학습 규칙(memory)은 사람이 만든 규칙이므로 LLM보다 우선한다.
 * 미분류·클러스터 카드에는 LLM 제안이 이기고, 비어 있는 단계도 채운다.
 */
export function mergeLlmSuggestions(result: ClassifyResult, suggestions: readonly LlmSuggestion[]): ClassifyResult {
  if (suggestions.length === 0) return result;
  const byIndex = new Map(suggestions.map((suggestion) => [suggestion.index, suggestion] as const));
  const cards: CardClassification[] = result.cards.map((card) => {
    const suggestion = byIndex.get(card.index);
    if (!suggestion) return card;
    const suggestedStage = WORKFLOW_CARD_STAGES.find((stage) => stage === suggestion.stage) ?? null;
    const stagePatch: Pick<CardClassification, 'stage' | 'stageConfidence'> =
      card.stage === null && suggestedStage
        ? { stage: suggestedStage as WorkflowCardStage, stageConfidence: 0.9 }
        : { stage: card.stage, stageConfidence: card.stageConfidence };
    if (card.groupSource === 'memory' || !suggestion.group) {
      return { ...card, ...stagePatch };
    }
    return {
      ...card,
      ...stagePatch,
      groupName: suggestion.group,
      jobName: suggestion.job || card.jobName,
      groupConfidence: 0.9,
      groupSource: 'llm',
      matchedKeyword: null,
    };
  });
  return { cards, buckets: buildBuckets(cards) };
}
