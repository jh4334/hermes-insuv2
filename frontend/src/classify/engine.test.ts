import { describe, expect, it } from 'vitest';
import { classifyCards } from './engine';
import { UNCLASSIFIED_GROUP_NAME, learnAssignment } from './ruleMemory';

const CARDS = [
  { title: '통일교육주간 운영 계획', category: null },
  { title: '통일교육주간 운영 결과보고', category: null },
  { title: '안전교육 기본계획 수립', category: '계획' },
  { title: '안전교육 소방대피훈련 결과보고', category: null },
  { title: '교직원 인사기록 카드 정리', category: null },
];

describe('classifyCards', () => {
  it('proposes stage + group for every card', () => {
    const result = classifyCards(CARDS);
    expect(result.cards).toHaveLength(CARDS.length);
    expect(result.cards[0].stage).toBe('계획');
    expect(result.cards[1].stage).toBe('결과보고');
  });

  it('clusters cards that share a title keyword into the same 세부업무 bucket', () => {
    const result = classifyCards(CARDS);
    expect(result.cards[0].groupName).toBe(result.cards[1].groupName);
    expect(result.cards[0].groupSource).toBe('cluster');
    expect(result.cards[2].groupName).toBe(result.cards[3].groupName);
  });

  it('routes low-confidence singleton cards to the 미분류 bucket', () => {
    const result = classifyCards(CARDS);
    expect(result.cards[4].groupName).toBe(UNCLASSIFIED_GROUP_NAME);
    expect(result.cards[4].groupSource).toBe('unclassified');
    expect(result.cards[4].groupConfidence).toBe(0);
  });

  it('prefers learned rule memory over clustering', () => {
    const rules = learnAssignment([], '통일교육주간 운영 계획', '통일', '계기교육');
    const result = classifyCards(CARDS, rules);
    expect(result.cards[0].groupName).toBe('통일');
    expect(result.cards[0].jobName).toBe('계기교육');
    expect(result.cards[0].groupSource).toBe('memory');
    expect(result.cards[0].groupConfidence).toBeGreaterThan(0.7);
  });

  it('builds buckets sorted by size with 미분류 last', () => {
    const result = classifyCards(CARDS);
    const names = result.buckets.map((bucket) => bucket.groupName);
    expect(names[names.length - 1]).toBe(UNCLASSIFIED_GROUP_NAME);
    const totalCards = result.buckets.reduce((sum, bucket) => sum + bucket.cardIndexes.length, 0);
    expect(totalCards).toBe(CARDS.length);
  });

  it('promotes committee titles to 심의·협의 stage', () => {
    const result = classifyCards([{ title: '학교급식소위원회 개최 계획', category: '계획' }]);
    expect(result.cards[0].stage).toBe('심의·협의');
  });

  it('extracts 사업 names and rework flags per card', () => {
    const result = classifyCards([
      { title: '통일교육주간 운영 계획', category: null },
      { title: '수학여행 품의 반려에 따른 재기안', category: null },
    ]);
    expect(result.cards[0].projectName).toBe('통일교육주간');
    expect(result.cards[0].isRework).toBe(false);
    expect(result.cards[1].projectName).toBeNull();
    expect(result.cards[1].isRework).toBe(true);
  });

  it('handles an empty card list', () => {
    expect(classifyCards([])).toEqual({ cards: [], buckets: [] });
  });
});
