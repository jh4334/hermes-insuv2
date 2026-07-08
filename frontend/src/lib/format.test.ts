import { describe, expect, it, vi } from 'vitest';
import type { AnalysisCard, ExtractedFile } from '../types';
import type { Task } from '../taskStorage';
import {
  actionableMissingResultGroupNames,
  buildAnnualFlow,
  buildAnnualIcs,
  buildRangeIcs,
  buildWorkflowSummaries,
  cardsToTasks,
  countSuccessorMemos,
  displayOrDash,
  escapeIcsText,
  foldIcsLine,
  groupColorStyle,
  icsDate,
  isSampleTask,
  missingResultGroupNames,
  pdfExtractionSummaryMessage,
  pdfFailureMessageWithGuidance,
  normalizeWorkflowCardStage,
  normalizeWorkflowStage,
  suggestGroupNameFromPreview,
  serializePmiMemo,
  taskToEditDraft,
  taskYear,
  textOrNull,
  truncateCalendarTitle,
  uniqueExistingGroups,
} from './format';
import { buildCalendarMonths } from './dates';

const baseTask = {
  id: 'task-1',
  title: '학교 안전 점검 계획 안내',
  description: '업무 카드 메모',
  start_date: '2026-05-11',
  end_date: null,
  category: '계획',
  group_name: '안전',
  group_color: '#dc2626',
  priority: 'normal',
  source_doc: '업무지원과-0000',
  owner: '담당자 확인',
  reference_location: 'K-에듀파인 또는 공문함',
  successor_memo: '작년 체크리스트 확인',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
} satisfies Task;

const analysisCard = {
  targetDate: '2026-05-11',
  sourceDate: '2025-05-12',
  title: '2026. 학교 안전 점검 계획 안내',
  sourceTitle: '[안내] 2025. 학교 안전 점검 계획 안내',
  docNumber: '',
  owner: '',
  referenceLabel: '업무지원과-0000 (25.05.12.)',
  referenceLocation: '',
  stage: '',
} satisfies AnalysisCard;

const extractedFile = {
  fileName: 'sample.pdf',
  sourceDate: '2025-05-12',
  docNumber: '업무지원과-0000',
  title: '학교 안전 점검 계획 안내',
  owner: '홍길동',
  department: '업무지원과',
  confidence: 95,
  status: '추출 완료',
  evidence: '기안일·문서번호·담당 후보 확인',
} satisfies ExtractedFile;

describe('format helpers', () => {
  it('adds teacher-facing PDF failure guidance by failure type', () => {
    expect(pdfFailureMessageWithGuidance('PDF 형식이 아닌 파일이 포함되어 있습니다: renamed.pdf')).toBe(
      'PDF 형식이 아닌 파일이 포함되어 있습니다: renamed.pdf · 원본 PDF를 선택하거나 PDF로 다시 저장한 뒤 다시 선택해 주세요',
    );
    expect(pdfFailureMessageWithGuidance('스캔 PDF이거나 텍스트가 없는 PDF일 수 있습니다')).toBe(
      '스캔 PDF이거나 텍스트가 없는 파일이에요 · 직접 입력하기를 사용하거나 글자를 선택할 수 있는 PDF를 올려 주세요',
    );
    expect(pdfFailureMessageWithGuidance('서버 연결 실패')).toBe(
      '서버 연결 실패 · 필요한 항목을 직접 입력하거나 PDF를 다시 선택하세요',
    );
  });

  it('summarizes PDF extraction results with next actions while keeping successes addable', () => {
    expect(pdfExtractionSummaryMessage(2, [extractedFile, { ...extractedFile, fileName: 'scan.pdf', status: '텍스트 없음 - 수동 입력', evidence: '텍스트 없음' }])).toBe(
      '2개 후보 추출 완료 · 업무묶음 이름을 정한 뒤 달력에 추가하세요',
    );
    expect(pdfExtractionSummaryMessage(1, [{ ...extractedFile, status: '텍스트 없음 - 수동 입력', evidence: '텍스트 없음' }])).toBe(
      '1개 후보 추출 완료 · 스캔 PDF이거나 텍스트가 없는 파일이에요 · 직접 입력하기를 사용할 수 있어요',
    );
    expect(pdfExtractionSummaryMessage(1, [extractedFile])).toBe(
      '1개 후보 추출 완료 · 업무묶음 이름을 정한 뒤 달력에 추가하세요',
    );
  });

  it('maps analysis cards to normal preview tasks without legacy metadata fallback strings', () => {
    expect(cardsToTasks([analysisCard])).toEqual([
      {
        title: '2026. 학교 안전 점검 계획 안내',
        description: '[안내] 2025. 학교 안전 점검 계획 안내\n근거: 업무지원과-0000 (25.05.12.)',
        start_date: '2026-05-11',
        end_date: null,
        category: null,
        priority: 'normal',
        source_doc: '업무지원과-0000 (25.05.12.)',
        owner: null,
        document_type: 'draft',
        sender_org: null,
        reference_location: 'K-에듀파인 또는 공문함',
        successor_memo: null,
      },
    ]);
  });

  it('maps received-document analysis cards to preview tasks with sender organization context', () => {
    const receivedCard = {
      ...analysisCard,
      title: '2026학년도 학생수련활동 사전 신청 안내',
      sourceTitle: '2025학년도 학생수련활동 사전 신청 안내',
      owner: '충청북도교육청',
      senderOrg: '충청북도교육청',
      documentType: 'received',
      docNumber: '체육건강안전과-4321',
      referenceLabel: '체육건강안전과-4321 (25.03.10.)',
    } satisfies AnalysisCard;

    expect(cardsToTasks([receivedCard])).toEqual([
      expect.objectContaining({
        title: '2026학년도 학생수련활동 사전 신청 안내',
        description: '2025학년도 학생수련활동 사전 신청 안내\n근거: 체육건강안전과-4321 (25.03.10.)\n발신기관: 충청북도교육청',
        source_doc: '체육건강안전과-4321',
        owner: '충청북도교육청',
        sender_org: '충청북도교육청',
        document_type: 'received',
      }),
    ]);
  });

  it('keeps missing-value display and sample markers unchanged', () => {
    expect(textOrNull('  참고자료 위치  ')).toBe('참고자료 위치');
    expect(textOrNull('   ')).toBeNull();
    expect(displayOrDash('')).toBe('–');
    expect(displayOrDash('홍길동')).toBe('홍길동');
    expect(isSampleTask({ ...baseTask, id: 'sample-1' })).toBe(true);
    expect(isSampleTask({ ...baseTask, source_doc: 'SAMPLE-001' })).toBe(true);
  });

  it('counts Plus/Minus notes and ignores legacy Interesting when serializing edit drafts', () => {
    expect(countSuccessorMemos([baseTask, { ...baseTask, id: 'task-2', successor_memo: '   ' }])).toBe(1);
    expect(taskToEditDraft({ ...baseTask, successor_memo: `Plus: 빨리 준비
Minus: 예산 촉박
Interesting: 협업 가능` })).toEqual({
      id: 'task-1',
      title: '학교 안전 점검 계획 안내',
      start_date: '2026-05-11',
      source_doc: '업무지원과-0000',
      owner: '담당자 확인',
      pmi_plus: '빨리 준비',
      pmi_minus: '예산 촉박',
    });
    expect(serializePmiMemo({ pmi_plus: '좋았던 점', pmi_minus: '' })).toBe('Plus: 좋았던 점');
  });

  it('preserves multiline text inside Plus and Minus fields until the next label', () => {
    const draft = taskToEditDraft({
      ...baseTask,
      successor_memo: `Plus: 첫 준비가 쉬움
세부 준비는 전년도 파일 확인
Minus: 예산 마감이 빠름
품의 전 담당자 협의 필요
Interesting: 지역 기관과 연계 가능
내년에는 공동 운영 검토`,
    });

    expect(draft.pmi_plus).toBe('첫 준비가 쉬움\n세부 준비는 전년도 파일 확인');
    expect(draft.pmi_minus).toBe('예산 마감이 빠름\n품의 전 담당자 협의 필요');
    expect('pmi_interesting' in draft).toBe(false);
    expect(serializePmiMemo(draft)).toBe('Plus: 첫 준비가 쉬움\n세부 준비는 전년도 파일 확인\nMinus: 예산 마감이 빠름\n품의 전 담당자 협의 필요');
  });

  it('formats calendar titles, group color styles, and ICS text exactly as before', () => {
    expect(truncateCalendarTitle('1234567890')).toBe('1234567890');
    expect(truncateCalendarTitle('12345678901')).toBe('1234567890…');
    expect(groupColorStyle('#dc2626')).toEqual({
      borderColor: '#dc2626',
      color: 'var(--color-foreground)',
      backgroundColor: 'color-mix(in oklab, #dc2626 10%, var(--color-background))',
    });
    expect(icsDate('2026-05-11')).toBe('20260511');
    expect(escapeIcsText('a\\b\nc;d,e')).toBe('a\\\\b\\nc\\;d\\,e');
    expect(foldIcsLine('SUMMARY:' + '가'.repeat(25))).toContain('\r\n ');
  });

  it('normalizes workflow stages and summarizes missing result reports by group', () => {
    const tasks = [
      baseTask,
      { ...baseTask, id: 'task-2', title: '학교 안전 점검 품의', category: '예산' },
      { ...baseTask, id: 'task-3', title: '계기교육 결과보고', category: '보고', group_name: '계기교육', group_color: '#2563eb' },
    ] satisfies Task[];

    expect(normalizeWorkflowStage('예산')).toBe('품의');
    expect(normalizeWorkflowCardStage('보고')).toBe('결과보고');
    expect(buildWorkflowSummaries(tasks)).toEqual([
      {
        groupName: '계기교육',
        groupColor: '#2563eb',
        counts: { 계획: 0, 품의: 0, 결과보고: 1 },
        hasMissingResultReport: false,
      },
      {
        groupName: '안전',
        groupColor: '#dc2626',
        counts: { 계획: 1, 품의: 1, 결과보고: 0 },
        hasMissingResultReport: true,
      },
    ]);
    expect([...missingResultGroupNames(tasks)]).toEqual(['안전']);
    expect([...actionableMissingResultGroupNames(tasks)]).toEqual(['안전']);
  });

  it('builds annual flow summaries and group suggestions with current ranking rules', () => {
    const months = buildCalendarMonths(2026);
    const flow = buildAnnualFlow([
      baseTask,
      { ...baseTask, id: 'task-2', start_date: '2026-05-20', group_name: '', group_color: '' },
    ], months);

    expect(flow.monthsFlow.find((month) => month.key === '2026-05')?.count).toBe(2);
    expect(flow.bundles).toEqual([
      { name: '미분류', color: '#9a0002', counts: { '2026-05': 1 }, total: 1 },
      { name: '안전', color: '#dc2626', counts: { '2026-05': 1 }, total: 1 },
    ]);
    expect(flow.maxMonthCount).toBe(2);
    expect(suggestGroupNameFromPreview([
      { ...cardsToTasks([analysisCard])[0], title: '2026. 현장체험학습 운영 계획' },
      { ...cardsToTasks([analysisCard])[0], title: '2026. 현장체험학습 결과보고 제출' },
    ])).toBe('현장체험학습');
    expect(uniqueExistingGroups([
      { group_name: ' 안전 ', group_color: '#dc2626' },
      { group_name: '안전', group_color: '#000000' },
      { group_name: '계기교육', group_color: '#2563eb' },
    ])).toEqual([
      { group_name: '계기교육', group_color: '#2563eb' },
      { group_name: '안전', group_color: '#dc2626' },
    ]);
  });

  it('builds annual and school-year ICS output with folded escaped task fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T00:00:00.000Z'));

    try {
      const ics = buildAnnualIcs([{ ...baseTask, title: '학교, 안전; 점검' }], 2026);
      expect(taskYear(baseTask)).toBe(2026);
      const unfoldedIcs = ics.replace(/\r\n /g, '');
      expect(unfoldedIcs).toContain('DTSTAMP:20260630T000000Z');
      expect(unfoldedIcs).toContain('SUMMARY:학교\\, 안전\\; 점검');
      expect(unfoldedIcs).toContain('DTEND;VALUE=DATE:20260512');
      expect(buildAnnualIcs([{ ...baseTask, end_date: '2026-99-99' }], 2026).replace(/\r\n /g, '')).toContain('DTEND;VALUE=DATE:20260512');
      expect(buildRangeIcs([
        baseTask,
        { ...baseTask, id: 'task-2', start_date: '2027-03-01' },
      ], 2026)).not.toContain('task-2');
    } finally {
      vi.useRealTimers();
    }
  });
});
