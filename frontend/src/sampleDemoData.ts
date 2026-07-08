import type { LocalDataSnapshot, Task } from './taskStorage';

const SAMPLE_GROUPS = {
  curriculum: { name: '교육과정', color: '#9a0002' },
  safety: { name: '안전교육', color: '#2563eb' },
  fieldTrip: { name: '현장체험학습', color: '#16a34a' },
  closing: { name: '학년말 정리', color: '#9333ea' },
  homeroom: { name: '학급운영', color: '#f97316' },
} as const;

type SampleTaskSeed = {
  readonly id: string;
  readonly month: number;
  readonly day: number;
  readonly nextYear?: boolean;
  readonly title: string;
  readonly group: keyof typeof SAMPLE_GROUPS;
  readonly stage: '계획' | '품의' | '결과보고';
  readonly doc: string;
  readonly owner: string | null;
  readonly reference: string | null;
};

const SAMPLE_TASKS: readonly SampleTaskSeed[] = [
  { id: 'curriculum-plan', month: 3, day: 4, title: '교육과정 운영 계획', group: 'curriculum', stage: '계획', doc: 'SAMPLE-EDU-001', owner: '교육과정부', reference: '공유드라이브/가상데이터/교육과정' },
  { id: 'curriculum-budget', month: 3, day: 18, title: '교육과정 운영 품의', group: 'curriculum', stage: '품의', doc: 'SAMPLE-EDU-002', owner: '교육과정부', reference: '공유드라이브/가상데이터/교육과정' },
  { id: 'curriculum-result', month: 7, day: 12, title: '교육과정 결과보고 정리', group: 'curriculum', stage: '결과보고', doc: 'SAMPLE-EDU-003', owner: '교육과정부', reference: '공유드라이브/가상데이터/교육과정' },
  { id: 'safety-plan', month: 4, day: 9, title: '안전교육 점검 계획', group: 'safety', stage: '계획', doc: 'SAMPLE-SAFE-001', owner: '담당자 확인', reference: null },
  { id: 'safety-budget', month: 5, day: 13, title: '안전교육 운영 품의', group: 'safety', stage: '품의', doc: 'SAMPLE-SAFE-002', owner: '안전담당', reference: '공유드라이브/가상데이터/안전교육' },
  { id: 'safety-result', month: 6, day: 20, title: '안전교육 결과보고', group: 'safety', stage: '결과보고', doc: 'SAMPLE-SAFE-003', owner: '안전담당', reference: '공유드라이브/가상데이터/안전교육' },
  { id: 'field-plan', month: 9, day: 3, title: '현장체험학습 운영 계획', group: 'fieldTrip', stage: '계획', doc: 'SAMPLE-FIELD-001', owner: '체험담당', reference: '공유드라이브/가상데이터/현장체험학습' },
  { id: 'field-budget', month: 10, day: 1, title: '현장체험학습 품의', group: 'fieldTrip', stage: '품의', doc: 'SAMPLE-FIELD-002', owner: '체험담당', reference: '공유드라이브/가상데이터/현장체험학습' },
  { id: 'closing-plan', month: 12, day: 9, title: '학년말 자료 정리 계획', group: 'closing', stage: '계획', doc: 'SAMPLE-CLOSE-001', owner: '학년업무담당', reference: '공유드라이브/가상데이터/학년말정리' },
  { id: 'closing-handoff', month: 2, day: 5, nextYear: true, title: '다음해 업무 흐름 확인', group: 'closing', stage: '계획', doc: 'SAMPLE-CLOSE-002', owner: null, reference: '공유드라이브/가상데이터/학년말정리' },
  { id: 'homeroom-jan', month: 1, day: 10, title: '학급운영 월간 점검', group: 'homeroom', stage: '계획', doc: 'SAMPLE-ROOM-001', owner: '담임업무', reference: '공유드라이브/가상데이터/학급운영' },
  { id: 'homeroom-mar', month: 3, day: 7, title: '학급 규칙 안내', group: 'homeroom', stage: '계획', doc: 'SAMPLE-ROOM-002', owner: '담임업무', reference: '공유드라이브/가상데이터/학급운영' },
  { id: 'homeroom-apr', month: 4, day: 11, title: '상담 주간 운영', group: 'homeroom', stage: '계획', doc: 'SAMPLE-ROOM-003', owner: '담임업무', reference: '공유드라이브/가상데이터/학급운영' },
  { id: 'homeroom-may', month: 5, day: 9, title: '출결 확인 흐름 점검', group: 'homeroom', stage: '계획', doc: 'SAMPLE-ROOM-004', owner: '담임업무', reference: '공유드라이브/가상데이터/학급운영' },
  { id: 'homeroom-jun', month: 6, day: 13, title: '생활기록 참고자료 정리', group: 'homeroom', stage: '계획', doc: 'SAMPLE-ROOM-005', owner: '담임업무', reference: '공유드라이브/가상데이터/학급운영' },
  { id: 'homeroom-jul', month: 7, day: 8, title: '방학 전 학급 안내', group: 'homeroom', stage: '계획', doc: 'SAMPLE-ROOM-006', owner: '담임업무', reference: '공유드라이브/가상데이터/학급운영' },
  { id: 'homeroom-sep', month: 9, day: 4, title: '2학기 학급운영 재정비', group: 'homeroom', stage: '계획', doc: 'SAMPLE-ROOM-007', owner: '담임업무', reference: '공유드라이브/가상데이터/학급운영' },
  { id: 'homeroom-oct', month: 10, day: 12, title: '학급 행사 운영 확인', group: 'homeroom', stage: '계획', doc: 'SAMPLE-ROOM-008', owner: '담임업무', reference: '공유드라이브/가상데이터/학급운영' },
  { id: 'homeroom-nov', month: 11, day: 6, title: '진급 자료 사전 정리', group: 'homeroom', stage: '계획', doc: 'SAMPLE-ROOM-009', owner: '담임업무', reference: '공유드라이브/가상데이터/학급운영' },
  { id: 'homeroom-dec', month: 12, day: 4, title: '학급운영 마무리 점검', group: 'homeroom', stage: '결과보고', doc: 'SAMPLE-ROOM-010', owner: '담임업무', reference: '공유드라이브/가상데이터/학급운영' },
];

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function buildSampleDemoData(targetYear = new Date().getFullYear()): Pick<LocalDataSnapshot, 'tasks' | 'memos' | 'bundlePmiMemos'> {
  const createdAt = `${targetYear}-01-01T00:00:00.000Z`;
  const tasks: Task[] = SAMPLE_TASKS.map((seed) => {
    const group = SAMPLE_GROUPS[seed.group];
    return {
      id: `sample-${targetYear}-${seed.id}`,
      title: seed.title,
      description: '실제 학교·교사·학생 정보가 없는 가상 데이터입니다.',
      start_date: isoDate(seed.nextYear ? targetYear + 1 : targetYear, seed.month, seed.day),
      end_date: null,
      category: seed.stage,
      group_name: group.name,
      group_color: group.color,
      priority: 'normal',
      source_doc: seed.doc,
      owner: seed.owner,
      reference_location: seed.reference,
      successor_memo: null,
      created_at: createdAt,
      updated_at: createdAt,
    };
  });
  return { tasks, memos: [], bundlePmiMemos: [] };
}
