import { beforeEach, describe, expect, it } from 'vitest';
import {
  RULE_MEMORY_KEY,
  UNCLASSIFIED_GROUP_NAME,
  extractTitleKeywords,
  learnAssignment,
  matchRuleMemory,
  normalizeStoredRules,
  readRuleMemory,
  writeRuleMemory,
} from './ruleMemory';

describe('extractTitleKeywords', () => {
  it('keeps meaningful tokens and drops stopwords, numbers, brackets', () => {
    const keywords = extractTitleKeywords('[긴급] 2025 통일교육주간 운영 계획 안내');
    expect(keywords).toContain('통일교육주간');
    expect(keywords).not.toContain('계획');
    expect(keywords).not.toContain('안내');
    expect(keywords).not.toContain('2025');
  });

  it('returns at most three keywords, longest first', () => {
    const keywords = extractTitleKeywords('학교폭력예방교육 어울림프로그램 자율동아리 활동지원 신청');
    expect(keywords.length).toBeLessThanOrEqual(3);
    expect(keywords[0].length).toBeGreaterThanOrEqual(keywords[keywords.length - 1].length);
  });
});

describe('learnAssignment + matchRuleMemory', () => {
  it('learns keyword→group rules from a confirmed assignment and matches similar titles', () => {
    const rules = learnAssignment([], '통일교육주간 운영 계획', '통일', '계기교육');
    const match = matchRuleMemory(rules, '2026 통일교육주간 결과보고');
    expect(match).not.toBeNull();
    expect(match?.group_name).toBe('통일');
    expect(match?.job_name).toBe('계기교육');
  });

  it('overrides a rule when the same keyword is reassigned to another group (오답 교정)', () => {
    let rules = learnAssignment([], '독도교육 실천주간 운영', '독도', null);
    rules = learnAssignment(rules, '독도교육 실천주간 운영', '계기교육행사', null);
    expect(matchRuleMemory(rules, '독도교육 실천주간 안내')?.group_name).toBe('계기교육행사');
  });

  it('raises confidence as the same assignment repeats', () => {
    let rules = learnAssignment([], '통일교육주간 운영', '통일');
    const first = matchRuleMemory(rules, '통일교육주간 계획')?.confidence ?? 0;
    rules = learnAssignment(rules, '통일교육주간 결과', '통일');
    const second = matchRuleMemory(rules, '통일교육주간 계획')?.confidence ?? 0;
    expect(second).toBeGreaterThan(first);
  });

  it('does not learn from 미분류 assignments', () => {
    expect(learnAssignment([], '알 수 없는 문서', UNCLASSIFIED_GROUP_NAME)).toEqual([]);
  });

  it('returns null when no rule matches', () => {
    const rules = learnAssignment([], '통일교육주간 운영', '통일');
    expect(matchRuleMemory(rules, '급식소위원회 개최')).toBeNull();
  });
});

describe('rule memory storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips rules through localStorage', () => {
    const rules = learnAssignment([], '통일교육주간 운영', '통일', '계기교육');
    writeRuleMemory(rules);
    const restored = readRuleMemory();
    expect(restored).toHaveLength(rules.length);
    expect(matchRuleMemory(restored, '통일교육주간 안내')?.group_name).toBe('통일');
  });

  it('ignores corrupted storage payloads', () => {
    localStorage.setItem(RULE_MEMORY_KEY, '{broken json');
    expect(readRuleMemory()).toEqual([]);
    localStorage.setItem(RULE_MEMORY_KEY, JSON.stringify([{ keyword: '', group_name: 'x' }, 42]));
    expect(readRuleMemory()).toEqual([]);
  });

  it('normalizes stored rule records', () => {
    const rules = normalizeStoredRules([
      { keyword: '통일교육주간', group_name: '통일', hits: 2.9, job_name: ' ' },
    ]);
    expect(rules).toEqual([
      { keyword: '통일교육주간', group_name: '통일', job_name: null, hits: 2, updated_at: new Date(0).toISOString() },
    ]);
  });
});
