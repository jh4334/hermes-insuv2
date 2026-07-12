import { extractProjectName } from './projects';
import { detectReworkLoop, resolveCardStage } from './stageRules';
import {
  UNCLASSIFIED_GROUP_NAME,
  extractTitleKeywords,
  matchRuleMemory,
} from './ruleMemory';
import type { LearnedRule } from './ruleMemory';
import type { WorkflowCardStage } from '../types';

/**
 * 자동 분류 엔진: "일단 다 쏟은" 카드 무더기에 단계 + 세부업무 후보를 붙인다.
 *
 * 층별 전략(기획 문서 §4):
 * - 단계: 제목 키워드 규칙 → stageRules
 * - 세부업무: 학습 규칙(ruleMemory) 우선, 없으면 제목 키워드 클러스터링으로 묶음 제안
 * - 업무: 자동화하지 않는다. 학습 규칙에 업무가 있으면 함께 제안만 한다.
 *
 * 확신 기반 라우팅: 확신이 낮은 카드(1건짜리 클러스터, 키워드 없음)는
 * 미분류 버킷으로 보내고 사람이 구조도에서 정리한다.
 */

export type ClassifiableCard = {
  readonly title: string;
  readonly category?: string | null;
};

export type GroupSource = 'memory' | 'cluster' | 'llm' | 'unclassified';

export type CardClassification = {
  readonly index: number;
  readonly stage: WorkflowCardStage | null;
  readonly stageConfidence: number;
  readonly groupName: string;
  readonly jobName: string | null;
  readonly projectName: string | null;
  readonly isRework: boolean;
  readonly groupConfidence: number;
  readonly groupSource: GroupSource;
  readonly matchedKeyword: string | null;
};

export type ClassifyBucket = {
  readonly groupName: string;
  readonly jobName: string | null;
  readonly source: GroupSource;
  readonly cardIndexes: number[];
};

export type ClassifyResult = {
  readonly cards: CardClassification[];
  readonly buckets: ClassifyBucket[];
};

const MIN_CLUSTER_SIZE = 2;

type GroupProposal = {
  readonly groupName: string;
  readonly jobName: string | null;
  readonly confidence: number;
  readonly source: GroupSource;
  readonly matchedKeyword: string | null;
};

function clusterByKeyword(cards: readonly ClassifiableCard[], remaining: Set<number>): Map<number, GroupProposal> {
  const proposals = new Map<number, GroupProposal>();
  const keywordToIndexes = new Map<string, number[]>();
  for (const index of remaining) {
    for (const keyword of extractTitleKeywords(cards[index].title)) {
      keywordToIndexes.set(keyword, [...(keywordToIndexes.get(keyword) ?? []), index]);
    }
  }

  const unassigned = new Set(remaining);
  while (unassigned.size > 0) {
    let bestKeyword: string | null = null;
    let bestIndexes: number[] = [];
    for (const [keyword, indexes] of keywordToIndexes) {
      const active = indexes.filter((index) => unassigned.has(index));
      if (active.length < MIN_CLUSTER_SIZE) continue;
      if (
        active.length > bestIndexes.length ||
        (active.length === bestIndexes.length && bestKeyword !== null && keyword.length > bestKeyword.length)
      ) {
        bestKeyword = keyword;
        bestIndexes = active;
      }
    }
    if (!bestKeyword) break;
    const clusterConfidence = Math.min(0.85, 0.5 + bestIndexes.length * 0.08);
    for (const index of bestIndexes) {
      proposals.set(index, {
        groupName: bestKeyword,
        jobName: null,
        confidence: clusterConfidence,
        source: 'cluster',
        matchedKeyword: bestKeyword,
      });
      unassigned.delete(index);
    }
  }
  return proposals;
}

export function classifyCards(cards: readonly ClassifiableCard[], rules: LearnedRule[] = []): ClassifyResult {
  const classified: CardClassification[] = [];
  const clusterCandidates = new Set<number>();
  const memoryProposals = new Map<number, GroupProposal>();

  for (let index = 0; index < cards.length; index += 1) {
    const memoryMatch = matchRuleMemory(rules, cards[index].title);
    if (memoryMatch) {
      memoryProposals.set(index, {
        groupName: memoryMatch.group_name,
        jobName: memoryMatch.job_name,
        confidence: memoryMatch.confidence,
        source: 'memory',
        matchedKeyword: memoryMatch.keyword,
      });
    } else {
      clusterCandidates.add(index);
    }
  }

  const clusterProposals = clusterByKeyword(cards, clusterCandidates);

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const stage = resolveCardStage(card.title, card.category ?? null);
    const proposal = memoryProposals.get(index) ?? clusterProposals.get(index) ?? {
      groupName: UNCLASSIFIED_GROUP_NAME,
      jobName: null,
      confidence: 0,
      source: 'unclassified' as const,
      matchedKeyword: null,
    };
    classified.push({
      index,
      stage: stage.stage,
      stageConfidence: stage.confidence,
      groupName: proposal.groupName,
      jobName: proposal.jobName,
      projectName: extractProjectName(card.title),
      isRework: detectReworkLoop(card.title),
      groupConfidence: proposal.confidence,
      groupSource: proposal.source,
      matchedKeyword: proposal.matchedKeyword,
    });
  }

  return { cards: classified, buckets: buildBuckets(classified) };
}

export function buildBuckets(cards: readonly CardClassification[]): ClassifyBucket[] {
  const map = new Map<string, ClassifyBucket>();
  for (const card of cards) {
    const current = map.get(card.groupName);
    if (current) {
      current.cardIndexes.push(card.index);
      continue;
    }
    map.set(card.groupName, {
      groupName: card.groupName,
      jobName: card.jobName,
      source: card.groupSource,
      cardIndexes: [card.index],
    });
  }
  return [...map.values()].sort((a, b) => {
    if (a.groupName === UNCLASSIFIED_GROUP_NAME) return 1;
    if (b.groupName === UNCLASSIFIED_GROUP_NAME) return -1;
    return b.cardIndexes.length - a.cardIndexes.length || a.groupName.localeCompare(b.groupName, 'ko');
  });
}
