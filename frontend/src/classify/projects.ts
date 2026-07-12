/**
 * 사업(project) 층 자동 추출(기획 문서 §5).
 * 세부업무 안의 묶음(예: 통일교육주간, 과학의 달 행사)을 제목에서 뽑아
 * 카드에 태그로 제안한다. 3층 그룹으로 승격할지는 파일럿 피드백으로 결정하므로
 * 지금은 카드 필드 + 태그 표시까지만 담당한다.
 */

const PROJECT_SUFFIXES = [
  '주간',
  '캠페인',
  '대회',
  '축제',
  '한마당',
  '발표회',
  '설명회',
  '박람회',
  '체험전',
  '골든벨',
  '올림피아드',
];

const PROJECT_TOKEN_PATTERN = new RegExp(`[가-힣A-Za-z0-9]{2,}(?:${PROJECT_SUFFIXES.join('|')})`, 'g');

/** 제목에서 사업명 후보를 추출한다. 없으면 null. */
export function extractProjectName(title: string): string | null {
  const matches = title.match(PROJECT_TOKEN_PATTERN) ?? [];
  const candidates = matches
    .map((token) => token.trim())
    // 접미사 단독(예: "주간")이나 너무 짧은 토큰은 사업명이 아니다.
    .filter((token) => PROJECT_SUFFIXES.every((suffix) => token !== suffix) && token.length >= 4);
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.length - a.length || a.localeCompare(b, 'ko'))[0];
}
