import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyCards } from './engine';
import {
  ONLINE_LLM_KEY,
  fetchLlmSuggestions,
  mergeLlmSuggestions,
  readOnlineLlmEnabled,
  writeOnlineLlmEnabled,
} from './llm';
import { learnAssignment } from './ruleMemory';

describe('online LLM opt-in storage', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to off (명시적 동의 전에는 전송하지 않음)', () => {
    expect(readOnlineLlmEnabled()).toBe(false);
  });

  it('round-trips the consent toggle', () => {
    writeOnlineLlmEnabled(true);
    expect(readOnlineLlmEnabled()).toBe(true);
    writeOnlineLlmEnabled(false);
    expect(readOnlineLlmEnabled()).toBe(false);
  });

  it('rejects unknown stored values', () => {
    localStorage.setItem(ONLINE_LLM_KEY, 'yes');
    expect(readOnlineLlmEnabled()).toBe(false);
  });
});

describe('fetchLlmSuggestions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts only titles and parses results', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [{ index: 0, job: '계기교육', group: '통일', stage: '계획' }] }), { status: 200 }),
    );
    const suggestions = await fetchLlmSuggestions(['통일교육주간 운영 계획']);
    expect(suggestions).toEqual([{ index: 0, job: '계기교육', group: '통일', stage: '계획' }]);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(Object.keys(body)).toEqual(['titles']);
  });

  it('returns null on server errors or network failure (오프라인 폴백)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"llm_unavailable"}', { status: 503 }));
    expect(await fetchLlmSuggestions(['제목'])).toBeNull();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await fetchLlmSuggestions(['제목'])).toBeNull();
  });
});

describe('mergeLlmSuggestions', () => {
  const CARDS = [
    { title: '정체불명 문서 하나', category: null },
    { title: '통일교육주간 운영 계획', category: '계획' },
  ];

  it('moves unclassified cards into LLM-suggested groups and fills missing stages', () => {
    const base = classifyCards(CARDS);
    const merged = mergeLlmSuggestions(base, [
      { index: 0, job: '계기교육', group: '통일', stage: '결과보고' },
    ]);
    expect(merged.cards[0].groupName).toBe('통일');
    expect(merged.cards[0].jobName).toBe('계기교육');
    expect(merged.cards[0].groupSource).toBe('llm');
    expect(merged.cards[0].stage).toBe('결과보고');
    expect(merged.buckets.some((bucket) => bucket.groupName === '통일')).toBe(true);
  });

  it('never overrides human-learned rule memory', () => {
    const rules = learnAssignment([], '통일교육주간 운영 계획', '통일', '계기교육');
    const base = classifyCards(CARDS, rules);
    const merged = mergeLlmSuggestions(base, [
      { index: 1, job: '다른업무', group: '엉뚱한묶음', stage: '품의' },
    ]);
    expect(merged.cards[1].groupName).toBe('통일');
    expect(merged.cards[1].groupSource).toBe('memory');
  });

  it('keeps the existing stage and ignores invalid suggested stages', () => {
    const base = classifyCards(CARDS);
    const merged = mergeLlmSuggestions(base, [
      { index: 1, job: '', group: '통일', stage: '검토중' },
      { index: 0, job: '', group: '', stage: '계획' },
    ]);
    expect(merged.cards[1].stage).toBe('계획');
    // 빈 group 제안은 배치를 바꾸지 않지만 비어 있는 단계는 채운다
    expect(merged.cards[0].groupName).toBe('미분류');
    expect(merged.cards[0].stage).toBe('계획');
  });
});

// The offline path must render immediately (no await), so merging an empty
// suggestion list is a no-op that returns the base result unchanged.
describe('offline path is synchronous-safe', () => {
  it('mergeLlmSuggestions with empty array returns the base result unchanged', () => {
    const base = classifyCards([{ title: '안전교육 계획', category: '계획' }]);
    expect(mergeLlmSuggestions(base, [])).toBe(base);
  });
});
