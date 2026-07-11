/**
 * 오답 학습(로컬 규칙 메모리).
 *
 * 사람이 카드를 특정 업무/세부업무로 옮기면 제목 키워드 → 그룹 매핑을 기억해 두고,
 * 다음에 비슷한 제목이 들어오면 자동 배치한다. ML이 아니라 키워드→그룹 매핑
 * 테이블이 자라는 구조라서 완전히 오프라인으로 동작한다. 학교 공문은 매년
 * 반복되므로 쓸수록 자동화율이 올라간다.
 */

export type LearnedRule = {
  readonly keyword: string;
  readonly group_name: string;
  readonly job_name: string | null;
  readonly hits: number;
  readonly updated_at: string;
};

export type RuleMatch = {
  readonly group_name: string;
  readonly job_name: string | null;
  readonly keyword: string;
  readonly confidence: number;
};

export const RULE_MEMORY_KEY = 'handover:rule-memory:v1';
export const UNCLASSIFIED_GROUP_NAME = '미분류';
const MAX_RULES = 500;
const MAX_KEYWORDS_PER_TITLE = 3;

const KEYWORD_STOPWORDS = new Set([
  '안내', '계획', '운영', '결과보고', '결과', '보고', '제출', '시행', '추진', '관련',
  '협조', '학교', '공문', '업무', '수립', '개최', '실시', '알림', '요청', '자료',
  '학년도', '학기', '위원회', '품의', '구입', '심의',
]);

export function extractTitleKeywords(title: string): string[] {
  const normalized = title
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\b\d{4}\b/g, ' ')
    .replace(/[0-9.()·ㆍ,/_-]+/g, ' ');
  const seen = new Set<string>();
  for (const token of normalized.match(/[가-힣A-Za-z]{2,}/g) ?? []) {
    const candidate = token.trim();
    if (candidate.length < 2 || KEYWORD_STOPWORDS.has(candidate)) continue;
    seen.add(candidate);
  }
  return [...seen].sort((a, b) => b.length - a.length || a.localeCompare(b, 'ko')).slice(0, MAX_KEYWORDS_PER_TITLE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeStoredRules(value: unknown): LearnedRule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const keyword = typeof item.keyword === 'string' ? item.keyword.trim() : '';
    const groupName = typeof item.group_name === 'string' ? item.group_name.trim() : '';
    if (!keyword || !groupName) return [];
    return [{
      keyword,
      group_name: groupName,
      job_name: typeof item.job_name === 'string' && item.job_name.trim() ? item.job_name.trim() : null,
      hits: typeof item.hits === 'number' && Number.isFinite(item.hits) ? Math.max(1, Math.floor(item.hits)) : 1,
      updated_at: typeof item.updated_at === 'string' ? item.updated_at : new Date(0).toISOString(),
    }];
  });
}

export function readRuleMemory(): LearnedRule[] {
  try {
    const raw = localStorage.getItem(RULE_MEMORY_KEY);
    if (!raw) return [];
    return normalizeStoredRules(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeRuleMemory(rules: LearnedRule[]): void {
  const trimmed = rules
    .slice()
    .sort((a, b) => b.hits - a.hits || b.updated_at.localeCompare(a.updated_at))
    .slice(0, MAX_RULES);
  localStorage.setItem(RULE_MEMORY_KEY, JSON.stringify(trimmed));
}

/**
 * 사람이 확정한 배치(제목 → 세부업무/업무)에서 키워드 규칙을 학습한다.
 * 같은 키워드를 다른 그룹으로 옮기면 최신 배치가 규칙을 덮어쓴다(오답 교정).
 */
export function learnAssignment(
  rules: LearnedRule[],
  title: string,
  groupName: string,
  jobName: string | null = null,
  learnedAt = new Date().toISOString(),
): LearnedRule[] {
  const trimmedGroup = groupName.trim();
  if (!trimmedGroup || trimmedGroup === UNCLASSIFIED_GROUP_NAME) return rules;
  const keywords = extractTitleKeywords(title);
  if (keywords.length === 0) return rules;

  const next = new Map(rules.map((rule) => [rule.keyword, rule] as const));
  for (const keyword of keywords) {
    const current = next.get(keyword);
    if (current && current.group_name === trimmedGroup) {
      next.set(keyword, {
        ...current,
        job_name: jobName?.trim() || current.job_name,
        hits: current.hits + 1,
        updated_at: learnedAt,
      });
    } else {
      next.set(keyword, {
        keyword,
        group_name: trimmedGroup,
        job_name: jobName?.trim() || null,
        hits: 1,
        updated_at: learnedAt,
      });
    }
  }
  return [...next.values()];
}

/** 제목과 가장 강하게 겹치는 학습 규칙을 찾는다. 없으면 null. */
export function matchRuleMemory(rules: LearnedRule[], title: string): RuleMatch | null {
  if (rules.length === 0) return null;
  let best: LearnedRule | null = null;
  for (const rule of rules) {
    if (!title.includes(rule.keyword)) continue;
    if (!best || rule.hits > best.hits || (rule.hits === best.hits && rule.keyword.length > best.keyword.length)) {
      best = rule;
    }
  }
  if (!best) return null;
  return {
    group_name: best.group_name,
    job_name: best.job_name,
    keyword: best.keyword,
    confidence: Math.min(0.95, 0.75 + best.hits * 0.05),
  };
}
