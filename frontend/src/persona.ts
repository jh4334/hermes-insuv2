import type { View } from './types';

/**
 * 투트랙 페르소나 토글(기획 문서 §2).
 * 인계자와 인수자는 별개 앱이 아니라 같은 산출물(구조도=인수인계서)의 양 끝이다.
 * 토글은 문구·기본 화면만 바꾸고 데이터 모델·분류 엔진은 하나로 공유한다.
 */

export type PersonaMode = 'giver' | 'receiver';

export const PERSONA_KEY = 'handover:persona:v1';

export type PersonaCopy = {
  readonly label: string;
  readonly toggleLabel: string;
  readonly oneLiner: string;
  readonly defaultView: View;
  readonly uploadTitle: string;
  readonly uploadSubtitle: string;
};

export const PERSONA_COPY: Record<PersonaMode, PersonaCopy> = {
  giver: {
    label: '인계자',
    toggleLabel: '내 업무 정리해 넘기기',
    oneLiner: '올해 내가 기안한 공문을 쏟아 넣고, 구조도로 정리해 인수인계서를 남깁니다.',
    defaultView: 'structure',
    uploadTitle: '올해 기안문 업로드',
    uploadSubtitle: '내 이름으로 기안한 문서를 우르르 올리면 자동 분류가 세부업무 후보를 제안합니다',
  },
  receiver: {
    label: '인수자',
    toggleLabel: '받은·작년 자료 파악하기',
    oneLiner: '전임자가 작년에 기안한 공문을 올리고, 자동 분류로 업무를 파악해 올해 계획을 세웁니다.',
    defaultView: 'calendar',
    uploadTitle: '작년 공문 업로드',
    uploadSubtitle: '전임자의 작년 문서를 올리면 올해 날짜로 옮겨 실행 캘린더를 만듭니다',
  },
};

export function readPersonaMode(): PersonaMode | null {
  try {
    const raw = localStorage.getItem(PERSONA_KEY);
    return raw === 'giver' || raw === 'receiver' ? raw : null;
  } catch {
    return null;
  }
}

export function writePersonaMode(mode: PersonaMode): void {
  localStorage.setItem(PERSONA_KEY, mode);
}
