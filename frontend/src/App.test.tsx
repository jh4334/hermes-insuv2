import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const TASKS_KEY = 'handover:tasks:v2';
const BUNDLE_PMI_KEY = 'handover:bundle-pmi-memos:v1';
const SNAPSHOT_KEY = 'handover:local-snapshot:v1';
const PERSONA_KEY = 'handover:persona:v1';
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    clear: vi.fn(() => storage.clear()),
  },
  configurable: true,
});

const extractPayload = {
  targetYear: 2026,
  documentLines: '2026-05-11 업무지원과-0000 [안내] 2026. 학교 안전 점검 계획 안내 / 담당: 담당자 확인',
  extractedFiles: [
    {
      fileName: '테스트공문.pdf',
      sourceDate: '2026-05-11',
      docNumber: '업무지원과-0000',
      title: '[안내] 2026. 학교 안전 점검 계획 안내',
      owner: '담당자 확인',
      department: '업무지원과',
      confidence: 100,
      status: '추출 완료',
      evidence: '날짜 추출, 제목 추출, 담당자 추출',
    },
  ],
  analysis: {
    targetYear: 2026,
    board: {
      cards: [
        {
          targetDate: '2026-05-11',
          sourceDate: '2026-05-11',
          title: '2026. 학교 안전 점검 계획 안내',
          sourceTitle: '[안내] 2026. 학교 안전 점검 계획 안내',
          docNumber: '업무지원과-0000',
          owner: '담당자 확인',
          referenceLabel: '업무지원과-0000 (26.05.11.)',
          referenceLocation: 'K-에듀파인 또는 공문함',
          stage: '계획',
        },
      ],
      monthLoad: { '5': 1 },
      peakMonths: [5],
    },
    workflow: { months: [{ month: 5, label: '5월', totalCards: 1 }] },
  },
};

const twoCardExtractPayload = {
  ...extractPayload,
  documentLines: [
    extractPayload.documentLines,
    '2026-06-03 교육지원과-0001 [안내] 2026. 계기교육 운영 계획 / 담당: 담당자 확인',
  ].join('\n'),
  extractedFiles: [
    ...extractPayload.extractedFiles,
    {
      fileName: '계기교육.pdf',
      sourceDate: '2026-06-03',
      docNumber: '교육지원과-0001',
      title: '[안내] 2026. 계기교육 운영 계획',
      owner: '담당자 확인',
      department: '교육지원과',
      confidence: 100,
      status: '추출 완료',
      evidence: '날짜 추출, 제목 추출, 담당자 추출',
    },
  ],
  analysis: {
    ...extractPayload.analysis,
    board: {
      ...extractPayload.analysis.board,
      cards: [
        ...extractPayload.analysis.board.cards,
        {
          targetDate: '2026-06-03',
          sourceDate: '2026-06-03',
          title: '2026. 계기교육 운영 계획',
          sourceTitle: '[안내] 2026. 계기교육 운영 계획',
          docNumber: '교육지원과-0001',
          owner: '담당자 확인',
          referenceLabel: '교육지원과-0001 (26.06.03.)',
          referenceLocation: 'K-에듀파인 또는 공문함',
          stage: '계획',
        },
      ],
      monthLoad: { '5': 1, '6': 1 },
      peakMonths: [5, 6],
    },
    workflow: {
      months: [
        { month: 5, label: '5월', totalCards: 1 },
        { month: 6, label: '6월', totalCards: 1 },
      ],
    },
  },
};

const reviewNeededExtractPayload = {
  ...extractPayload,
  extractedFiles: [
    {
      ...extractPayload.extractedFiles[0],
    },
  ],
  analysis: {
    ...extractPayload.analysis,
    board: {
      ...extractPayload.analysis.board,
      cards: [
        {
          ...extractPayload.analysis.board.cards[0],
        },
      ],
    },
  },
};

const fieldTripExtractPayload = {
  ...twoCardExtractPayload,
  documentLines: [
    '2026-04-01 체험학습-0001 [안내] 2026. 현장체험학습 운영 계획 / 담당: 담당자 확인',
    '2026-04-20 체험학습-0002 [안내] 2026. 현장체험학습 결과보고 제출 / 담당: 담당자 확인',
  ].join('\n'),
  extractedFiles: [
    {
      ...extractPayload.extractedFiles[0],
      fileName: '현장체험계획.pdf',
      sourceDate: '2026-04-01',
      docNumber: '체험학습-0001',
      title: '[안내] 2026. 현장체험학습 운영 계획',
      status: '추출 완료',
    },
    {
      ...extractPayload.extractedFiles[0],
      fileName: '현장체험결과.pdf',
      sourceDate: '2026-04-20',
      docNumber: '체험학습-0002',
      title: '[안내] 2026. 현장체험학습 결과보고 제출',
      status: '추출 완료',
    },
  ],
  analysis: {
    ...extractPayload.analysis,
    board: {
      ...extractPayload.analysis.board,
      cards: [
        {
          ...extractPayload.analysis.board.cards[0],
          targetDate: '2026-04-01',
          sourceDate: '2026-04-01',
          title: '2026. 현장체험학습 운영 계획',
          sourceTitle: '[안내] 2026. 현장체험학습 운영 계획',
          docNumber: '체험학습-0001',
        },
        {
          ...extractPayload.analysis.board.cards[0],
          targetDate: '2026-04-20',
          sourceDate: '2026-04-20',
          title: '2026. 현장체험학습 결과보고 제출',
          sourceTitle: '[안내] 2026. 현장체험학습 결과보고 제출',
          docNumber: '체험학습-0002',
        },
      ],
      monthLoad: { '4': 2 },
      peakMonths: [4],
    },
    workflow: { months: [{ month: 4, label: '4월', totalCards: 2 }] },
  },
};

const receivedDocumentExtractPayload = {
  ...extractPayload,
  documentLines: '2026-03-10 체육건강안전과-4321 학생수련활동 사전 신청 안내 / 발신기관: 충청북도교육청',
  extractedFiles: [
    {
      ...extractPayload.extractedFiles[0],
      fileName: '수련활동접수.pdf',
      sourceDate: '2026-03-10',
      docNumber: '체육건강안전과-4321',
      title: '학생수련활동 사전 신청 안내',
      owner: '충청북도교육청',
      senderOrg: '충청북도교육청',
      documentType: 'received',
      department: '체육건강안전과',
      evidence: '날짜 추출, 제목 추출, 발신기관 추출',
    },
  ],
  analysis: {
    ...extractPayload.analysis,
    board: {
      ...extractPayload.analysis.board,
      cards: [
        {
          ...extractPayload.analysis.board.cards[0],
          targetDate: '2026-03-10',
          sourceDate: '2026-03-10',
          title: '학생수련활동 사전 신청 안내',
          sourceTitle: '학생수련활동 사전 신청 안내',
          docNumber: '체육건강안전과-4321',
          owner: '충청북도교육청',
          senderOrg: '충청북도교육청',
          documentType: 'received',
          referenceLabel: '체육건강안전과-4321 (26.03.10.)',
        },
      ],
    },
  },
};

const mixedReviewExtractPayload = {
  ...twoCardExtractPayload,
  extractedFiles: [
  ],
  analysis: {
    ...twoCardExtractPayload.analysis,
    board: {
      ...twoCardExtractPayload.analysis.board,
      cards: [
      ],
    },
  },
};

async function uploadSamplePdfToBoard(groupName = '계기교육') {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(extractPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  fireEvent.change(screen.getByLabelText(/PDF 공문 파일 선택/i), {
    target: { files: [new File(['%PDF-1.4'], '테스트공문.pdf', { type: 'application/pdf' })] },
  });
  fireEvent.click(await screen.findByRole('button', { name: /1건 자동 분류 제안 보기/i }));
  await confirmClassifyReview({ renameFirstBucketTo: groupName, confirmLabel: /1건 일괄 확인/i });
}

async function confirmClassifyReview({ renameFirstBucketTo, confirmLabel }: { renameFirstBucketTo?: string; confirmLabel: RegExp }) {
  expect(await screen.findByText(/이렇게 나눴어요/i)).toBeInTheDocument();
  if (renameFirstBucketTo !== undefined) {
    fireEvent.change(screen.getAllByLabelText(/묶음 이름 수정/i)[0], { target: { value: renameFirstBucketTo } });
  }
  fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
  await waitFor(() => expect(screen.queryByText(/이렇게 나눴어요/i)).not.toBeInTheDocument());
}

function seedTasksForCalendar(tasks: Array<Partial<Record<string, unknown>>>) {
  storage.set(SNAPSHOT_KEY, JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-06-30T00:00:00.000Z',
    tasks: tasks.map((task, index) => ({
      id: `seed-${index + 1}`,
      title: `샘플 공문 ${index + 1}`,
      description: '공문 기반 일정',
      start_date: '2026-05-11',
      end_date: null,
      category: '계획',
      group_name: '업무',
      group_color: '#64748b',
      priority: 'normal',
      source_doc: `샘플-${index + 1}`,
      owner: '담당자 확인',
      reference_location: 'K-에듀파인 또는 공문함',
      successor_memo: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...task,
    })),
    memos: [],
    bundlePmiMemos: [],
  }));
}

function showMonth(month: number) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`올해 ${month}월 보기`) }));
}

function installDownloadCapture() {
  let capturedBlob: Blob | null = null;
  let capturedFilename = '';
  const createObjectURL = vi.fn((blob: Blob) => {
    capturedBlob = blob;
    return 'blob:local-download';
  });
  const revokeObjectURL = vi.fn();
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    capturedFilename = this.download;
  });
  Object.defineProperty(globalThis.URL, 'createObjectURL', { value: createObjectURL, configurable: true });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
  return {
    getBlob: () => {
      if (!capturedBlob) throw new Error('download blob was not captured');
      return capturedBlob;
    },
    getFilename: () => capturedFilename,
    getText: async () => {
      if (!capturedBlob) throw new Error('download blob was not captured');
      return capturedBlob.text();
    },
    click,
  };
}

function unfoldIcs(ics: string) {
  return ics.replace(/\r\n[ \t]/g, '');
}

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('team-handoff frontend replacement', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    storage.set(PERSONA_KEY, 'receiver');
    vi.restoreAllMocks();
  });

  it('uses a warm paper theme instead of the old dark cockpit tokens', () => {
    const styles = readSource('./styles.css');

    expect(styles).toContain('Warm Paper');
    expect(styles).toContain('--background: #f4ede3');
    expect(styles).toContain('--surface: #fffaf3');
    expect(styles).toContain('--ember: #9a0002');
    expect(styles).toContain('"Pretendard"');
    expect(styles).not.toContain('Charcoal & Ember');
    expect(styles).not.toContain('oklch(0.18 0 0)');
    expect(styles).not.toContain('"Sora"');
    expect(styles).not.toContain('"Manrope"');
  });

  it('keeps stage pills and compact labels readable on the light paper theme', () => {
    const appSource = readSource('./App.tsx');
    const groupControlsSource = readSource('./TaskGroupControls.tsx');
    const source = `${appSource}\n${groupControlsSource}`;

    expect(source).not.toMatch(/text-sky-200|text-amber-200|text-emerald-200/);
    expect(source).not.toMatch(/bg-(sky|amber|emerald)-400\/15/);
    expect(source).not.toContain('text-[9px]');
    expect(source).not.toContain('text-[10px]');
    expect(source).toContain('text-sky-700');
    expect(source).toContain('text-amber-800');
    expect(source).toContain('text-emerald-700');
    expect(source).toContain('text-[11px]');
  });

  it('keeps toast notifications on the warm paper light theme', () => {
    const mainSource = readSource('./main.tsx');

    expect(mainSource).not.toContain('theme="dark"');
    expect(mainSource).toContain('theme="light"');
    expect(mainSource).toContain('toastOptions');
    expect(mainSource).toContain('bg-[#fffaf3]');
    expect(mainSource).toContain('text-[#2b1d18]');
  });

  it('opens directly to a calendar-first navigation with PDF upload, structure view, and opt-in sample demo', () => {
    render(<App />);

    expect(JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{"tasks":[]}').tasks).toHaveLength(0);
    expect(screen.getByRole('heading', { name: /모두의 인수인계/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /연간 캘린더/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^캘린더$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^구조도$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^업무목록$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^내보내기$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /대시보드/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /월간 캘린더/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /간트차트/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^메모$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/작년 공문 업로드/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /샘플 데이터로 둘러보기/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/실제 학교·교사·학생 정보가 없는 가상 데이터/i)).toBeInTheDocument();
    expect(screen.queryByText(/Doc → Calendar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Navigation/i)).not.toBeInTheDocument();
    expect(screen.getByText(/아직 추출된 업무가 없어요/i)).toBeInTheDocument();
    expect(screen.queryByText(/추출된 업무 타일/i)).not.toBeInTheDocument();
  });

  it('loads synthetic sample demo data only after opt-in and enables calendar/list/export demo flow', async () => {
    const downloadCapture = installDownloadCapture();
    render(<App />);

    expect(JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{"tasks":[]}').tasks).toHaveLength(0);
    fireEvent.click(screen.getAllByRole('button', { name: /샘플 데이터로 둘러보기/i })[0]);

    await waitFor(() => expect(JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}').tasks.length).toBeGreaterThanOrEqual(10));
    const snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    expect(snapshot.tasks.length).toBeGreaterThanOrEqual(10);
    expect(JSON.stringify(snapshot)).toContain('SAMPLE-');
    expect(JSON.stringify(snapshot)).not.toMatch(/\.pdf|초등학교|중학교|고등학교|학부모|업무지원과-\d+|성과|절감/i);

    expect(screen.getByRole('region', { name: /연간 업무 흐름/i })).toHaveTextContent(/교육과정/);
    expect(screen.getByRole('region', { name: /연간 업무 흐름/i })).toHaveTextContent(/안전교육/);
    expect(screen.queryByRole('region', { name: /검토 모음 제거됨/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^업무목록$/i }));
    expect(screen.getByRole('heading', { name: /^업무목록$/i })).toBeInTheDocument();
    expect(screen.getByText(/SAMPLE-EDU-001/i)).toBeInTheDocument();
    expect(screen.queryByText(/공유드라이브\/가상데이터\/교육과정/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^내보내기$/i }));
    expect(screen.getByRole('button', { name: /업무묶음 DOCX 생성/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /업무묶음 Markdown 저장/i }));
    const markdown = await downloadCapture.getText();
    expect(markdown).toContain('SAMPLE-');
    expect(markdown).not.toMatch(/\.pdf|초등학교|중학교|고등학교|학부모|성과|절감/i);
  });

  it('requires confirmation before adding sample data to an existing local board and can undo the bulk add', () => {
    seedTasksForCalendar([{ title: '기존 업무', group_name: '기존 꾸러미', source_doc: 'EXISTING-001' }]);
    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: /샘플 데이터로 둘러보기/i })[0]);
    expect(screen.getByText(/기존 로컬 데이터가 있습니다/i)).toBeInTheDocument();
    let snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    expect(snapshot.tasks).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /샘플 데이터 추가/i }));
    snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    expect(snapshot.tasks.length).toBeGreaterThan(1);
    expect(snapshot.tasks.some((task: { title: string }) => task.title === '기존 업무')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /마지막 작업 되돌리기/i }));
    snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0].title).toBe('기존 업무');
  });

  it('auto-hides the undo affordance after a short grace period so it does not cover presentation content', () => {
    vi.useFakeTimers();
    seedTasksForCalendar([{ title: '삭제 테스트 업무', source_doc: 'SAMPLE-DELETE-001' }]);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^업무목록$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^삭제$/i }));
    expect(screen.getByRole('button', { name: /마지막 작업 되돌리기/i })).toHaveTextContent(/업무 삭제/i);

    act(() => {
      vi.advanceTimersByTime(4900);
    });
    expect(screen.getByRole('button', { name: /마지막 작업 되돌리기/i })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole('button', { name: /마지막 작업 되돌리기/i })).not.toBeInTheDocument();
  });

  it('undoes a task deletion from the task list', () => {
    seedTasksForCalendar([{ title: '삭제 테스트 업무', source_doc: 'SAMPLE-DELETE-001' }]);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^업무목록$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^삭제$/i }));
    let snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    expect(snapshot.tasks).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /마지막 작업 되돌리기/i }));
    snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0].title).toBe('삭제 테스트 업무');
  });

  it('guards backup import with append, replace, and cancel choices', async () => {
    seedTasksForCalendar([{ title: '기존 업무', source_doc: 'EXISTING-001', successor_memo: '기존 메모' }]);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^내보내기$/i }));

    const backup = {
      schemaVersion: 1,
      exportedAt: '2026-07-01T00:00:00.000Z',
      tasks: [{
        id: 'seed-1',
        title: '가져온 업무',
        description: '백업 업무',
        start_date: '2026-07-02',
        end_date: null,
        category: '계획',
        group_name: '백업 꾸러미',
        group_color: '#9a0002',
        priority: 'normal',
        source_doc: 'BACKUP-001',
        owner: '백업담당',
        reference_location: '백업 위치',
        successor_memo: '가져온 메모',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
      }],
      memos: [],
    };

    fireEvent.change(screen.getByLabelText(/로컬 백업 파일 선택/i), {
      target: { files: [new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })] },
    });

    const importHeading = await screen.findByText(/가져올 백업 확인/i);
    const importPanel = importHeading.closest('div');
    expect(importPanel).not.toBeNull();
    expect(within(importPanel as HTMLElement).getByText(/업무 1건 · Plus\/Minus 메모 1건/i)).toBeInTheDocument();
    let snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0].title).toBe('기존 업무');

    fireEvent.click(await screen.findByRole('button', { name: /기존에 추가/i }));
    snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    expect(snapshot.tasks).toHaveLength(2);
    expect(new Set(snapshot.tasks.map((task: { id: string }) => task.id)).size).toBe(2);
    expect(snapshot.tasks.map((task: { title: string }) => task.title)).toEqual(expect.arrayContaining(['기존 업무', '가져온 업무']));

    fireEvent.change(screen.getByLabelText(/로컬 백업 파일 선택/i), {
      target: { files: [new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /취소/i }));
    snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    expect(snapshot.tasks).toHaveLength(2);

    fireEvent.change(screen.getByLabelText(/로컬 백업 파일 선택/i), {
      target: { files: [new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /대체/i }));
    snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0].title).toBe('가져온 업무');
  });

  it('clusters extracted PDF tasks into a suggested 세부업무 bucket so no group typing is required', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(fieldTripExtractPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);

    fireEvent.change(screen.getByLabelText(/PDF 공문 파일 선택/i), {
      target: { files: [new File(['%PDF-1.4'], '현장체험.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByLabelText(/1번 후보 업무명/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/업무묶음 이름 입력/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /2건 자동 분류 제안 보기/i }));

    expect(await screen.findByText(/이렇게 나눴어요/i)).toBeInTheDocument();
    const bucketInput = screen.getAllByLabelText(/묶음 이름 수정/i)[0] as HTMLInputElement;
    expect(bucketInput.value).toBe('현장체험학습');
    expect(screen.getByText(/자동 묶음/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /2건 일괄 확인/i }));

    await waitFor(() => expect(screen.queryByText(/이렇게 나눴어요/i)).not.toBeInTheDocument());
    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks).toHaveLength(2);
    expect(storedTasks).toEqual([
      expect.objectContaining({ group_name: '현장체험학습', group_color: expect.stringMatching(/^#[0-9a-f]{6}$/i) }),
      expect.objectContaining({ group_name: '현장체험학습', group_color: expect.stringMatching(/^#[0-9a-f]{6}$/i) }),
    ]);
  });

  it('separates received documents from draft uploads and saves sender organization into the chosen bundle', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const form = init?.body as FormData;
      expect(form.get('documentType')).toBe('received');
      return new Response(JSON.stringify(receivedDocumentExtractPayload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    render(<App />);

    fireEvent.click(screen.getByLabelText(/접수공문/i));
    fireEvent.change(screen.getByLabelText(/PDF 공문 파일 선택/i), {
      target: { files: [new File(['%PDF-1.4'], '수련활동접수.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText(/발신기관을 읽고 있습니다/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/1번 후보 발신기관/i)).toHaveValue('충청북도교육청');
    expect(screen.getByText(/발신기관 충청북도교육청/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /1건 자동 분류 제안 보기/i }));
    await confirmClassifyReview({ renameFirstBucketTo: '수련활동', confirmLabel: /1건 일괄 확인/i });
    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks).toEqual([
      expect.objectContaining({
        group_name: '수련활동',
        owner: '충청북도교육청',
        sender_org: '충청북도교육청',
        document_type: 'received',
        description: expect.stringContaining('발신기관: 충청북도교육청'),
      }),
    ]);
  });

  it('lets teachers merge a suggested bucket into an existing group instead of typing the group name', async () => {
    storage.set(SNAPSHOT_KEY, JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-06-30T00:00:00.000Z',
      tasks: [
        {
          id: 'existing-task',
          title: '기존 교육과정 업무',
          description: '기존 업무',
          start_date: '2026-04-01',
          end_date: null,
          category: '계획',
          group_name: '교육과정',
          group_color: '#2563eb',
          priority: 'normal',
          source_doc: '기존-0001',
          owner: '교무부',
          reference_location: 'K-에듀파인 또는 공문함',
          successor_memo: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      memos: [],
    }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(fieldTripExtractPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);

    fireEvent.change(screen.getByLabelText(/PDF 공문 파일 선택/i), {
      target: { files: [new File(['%PDF-1.4'], '현장체험.pdf', { type: 'application/pdf' })] },
    });

    fireEvent.click(await screen.findByRole('button', { name: /2건 자동 분류 제안 보기/i }));
    expect(await screen.findByText(/이렇게 나눴어요/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/현장체험학습 묶음 병합 대상 선택/i), { target: { value: '교육과정' } });
    fireEvent.click(screen.getByRole('button', { name: /2건 일괄 확인/i }));

    await waitFor(() => expect(screen.queryByText(/이렇게 나눴어요/i)).not.toBeInTheDocument());
    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks.slice(1)).toEqual([
      expect.objectContaining({ group_name: '교육과정', group_color: '#2563eb' }),
      expect.objectContaining({ group_name: '교육과정', group_color: '#2563eb' }),
    ]);
  });

it('appends an extracted PDF batch and gives every new task the same unused visible group color when possible', async () => {
    storage.set(SNAPSHOT_KEY, JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-06-30T00:00:00.000Z',
      tasks: [
        {
          id: 'existing-task',
          title: '기존 교육과정 업무',
          description: '기존 업무',
          start_date: '2026-04-01',
          end_date: null,
          category: '계획',
          group_name: '교육과정',
          group_color: '#2563eb',
          priority: 'normal',
          source_doc: '기존-0001',
          owner: '교무부',
          reference_location: 'K-에듀파인 또는 공문함',
          successor_memo: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      memos: [],
    }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(twoCardExtractPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);

    fireEvent.change(screen.getByLabelText(/PDF 공문 파일 선택/i), {
      target: { files: [new File(['%PDF-1.4'], '첫번째.pdf', { type: 'application/pdf' }), new File(['%PDF-1.4'], '두번째.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /2건 자동 분류 제안 보기/i }));
    await confirmClassifyReview({ renameFirstBucketTo: '계기교육', confirmLabel: /2건 일괄 확인/i });

    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks).toHaveLength(3);
    expect(storedTasks[0]).toEqual(expect.objectContaining({ id: 'existing-task', group_name: '교육과정', group_color: '#2563eb' }));
    const addedTasks = storedTasks.slice(1);
    expect(addedTasks).toEqual([
      expect.objectContaining({ title: '2026. 학교 안전 점검 계획 안내', group_name: '계기교육' }),
      expect.objectContaining({ title: '2026. 계기교육 운영 계획', group_name: '계기교육' }),
    ]);
    expect(addedTasks[0].group_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(addedTasks[0].group_color).toBe(addedTasks[1].group_color);
    expect(addedTasks[0].group_color).not.toBe('#2563eb');
  });

  it('reuses an existing group color when adding more PDFs to the same named group', async () => {
    storage.set(SNAPSHOT_KEY, JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-06-30T00:00:00.000Z',
      tasks: [
        {
          id: 'existing-task',
          title: '기존 교육과정 업무',
          description: '기존 업무',
          start_date: '2026-04-01',
          end_date: null,
          category: '계획',
          group_name: '교육과정',
          group_color: '#2563eb',
          priority: 'normal',
          source_doc: '기존-0001',
          owner: '교무부',
          reference_location: 'K-에듀파인 또는 공문함',
          successor_memo: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      memos: [],
    }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(extractPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);

    fireEvent.change(screen.getByLabelText(/PDF 공문 파일 선택/i), {
      target: { files: [new File(['%PDF-1.4'], '교육과정추가.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /1건 자동 분류 제안 보기/i }));
    await confirmClassifyReview({ renameFirstBucketTo: ' 교육과정 ', confirmLabel: /1건 일괄 확인/i });

    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks).toHaveLength(2);
    expect(storedTasks[1]).toEqual(expect.objectContaining({ group_name: '교육과정', group_color: '#2563eb' }));
  });

  it('does not show fixed category manual selection or category filters', () => {
    render(<App />);

    expect(screen.queryByLabelText(/업무묶음 선택/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/업무묶음 필터/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/키워드 기반 제안/i)).not.toBeInTheDocument();
  });

  it('uses backend codex PDF extraction and refreshes the task board from upload preview', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(extractPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);

    const input = screen.getByLabelText(/PDF 공문 파일 선택/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['%PDF-1.4'], '테스트공문.pdf', { type: 'application/pdf' })] } });

    expect(await screen.findByText(/추출 결과 미리보기/i)).toBeInTheDocument();
    expect(screen.getByText(/파일별 분석 상태/i)).toBeInTheDocument();
    expect(screen.getByText(/업무지원과-0000/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /1건 자동 분류 제안 보기/i }));
    await confirmClassifyReview({ renameFirstBucketTo: '계기교육', confirmLabel: /1건 일괄 확인/i });

    await waitFor(() => expect(screen.queryByText(/추출 결과 미리보기/i)).not.toBeInTheDocument());
    showMonth(5);
    const may = screen.getByRole('region', { name: /2026년 5월 연간 캘린더/i });
    const may11 = within(may).getByRole('button', { name: /2026-05-11 날짜칸 1건/i });
    expect(within(may11).getByText(/2026\. 학교 안…/i)).toBeInTheDocument();
    expect(within(may11).getByLabelText(/단계: 계획/i)).toBeInTheDocument();
  });

  it('lets teachers correct extracted PDF candidate fields before adding them to the board', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(extractPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);

    fireEvent.change(screen.getByLabelText(/PDF 공문 파일 선택/i), {
      target: { files: [new File(['%PDF-1.4'], '테스트공문.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText(/추출 결과 미리보기/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/1번 후보 업무명/i), { target: { value: '수정한 안전 점검 계획' } });
    fireEvent.change(screen.getByLabelText(/1번 후보 기안일/i), { target: { value: '2026-05-13' } });
    fireEvent.change(screen.getByLabelText(/1번 후보 문서번호/i), { target: { value: '수정-0001' } });
    fireEvent.change(screen.getByLabelText(/1번 후보 담당/i), { target: { value: '홍길동' } });
    expect(screen.queryByLabelText(/1번 후보 참고자료 위치/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /1건 자동 분류 제안 보기/i }));
    await confirmClassifyReview({ renameFirstBucketTo: '안전교육', confirmLabel: /1건 일괄 확인/i });

    await waitFor(() => expect(screen.queryByText(/추출 결과 미리보기/i)).not.toBeInTheDocument());
    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks).toEqual([
      expect.objectContaining({
        title: '수정한 안전 점검 계획',
        start_date: '2026-05-13',
        source_doc: '수정-0001',
        owner: '홍길동',
        reference_location: 'K-에듀파인 또는 공문함',
        priority: 'normal',
      }),
    ]);
  });

  it('sends next year to PDF extraction when 내년 is selected', async () => {
    const currentYear = new Date().getFullYear();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(reviewNeededExtractPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);

    fireEvent.click(screen.getByRole('radio', { name: /내년/i }));
    fireEvent.change(screen.getByLabelText(/PDF 공문 파일 선택/i), {
      target: { files: [new File(['%PDF-1.4'], '내년공문.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText(/추출 결과 미리보기/i)).toBeInTheDocument();
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (!(body instanceof FormData)) throw new Error('expected PDF extraction request body to be FormData');
    expect(body.get('targetYear')).toBe(String(currentYear + 1));
  });

it('shows per-file upload states and keeps successful candidates when one PDF needs attention', async () => {
    const partialPayload = {
      ...extractPayload,
      extractedFiles: [
        extractPayload.extractedFiles[0],
        {
          fileName: '깨진파일.pdf',
          sourceDate: '',
          docNumber: '',
          title: '깨진파일.pdf',
          owner: '',
          department: '',
          confidence: 0,
          status: '추출 실패',
          evidence: '',
        },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(partialPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);

    fireEvent.change(screen.getByLabelText(/PDF 공문 파일 선택/i), {
      target: { files: [new File(['%PDF-1.4'], '정상.pdf', { type: 'application/pdf' }), new File(['%PDF-1.4'], '깨진파일.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText(/1개 후보 추출 완료 · 자동 분류 제안을 확인한 뒤 추가하세요/i)).toBeInTheDocument();
    const statusList = screen.getByRole('region', { name: /파일별 분석 상태/i });
    expect(within(statusList).getByText(/테스트공문\.pdf/i)).toBeInTheDocument();
    expect(within(statusList).getByText(/추출 완료/i)).toBeInTheDocument();
    expect(within(statusList).getByText(/깨진파일\.pdf/i)).toBeInTheDocument();
    expect(within(statusList).getByText(/추출 실패/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1건 자동 분류 제안 보기/i })).toBeEnabled();
  });

  it('normalizes legacy localStorage tasks without automatic category classification', () => {
    storage.set(TASKS_KEY, JSON.stringify([
      {
        id: 'legacy-1',
        title: '학교 예산 계약 및 물품 구매 안내',
        description: '작년 공문 기반 업무 흐름',
        start_date: '2026-04-02',
        end_date: null,
        category: '계획',
        priority: 'normal',
        source_doc: '행정실-0001',
        owner: '행정실',
        reference_location: 'K-에듀파인 또는 공문함',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]));

    render(<App />);
    showMonth(4);

    expect(screen.getByLabelText(/단계: 계획/i)).toBeInTheDocument();
    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks).toEqual([
      expect.objectContaining({
        group_name: '업무',
        group_color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        successor_memo: null,
      }),
    ]);
    const snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    expect(snapshot).toEqual(expect.objectContaining({
      schemaVersion: 1,
      tasks: [expect.objectContaining({ id: 'legacy-1', group_name: '업무' })],
      memos: [],
    }));
  });

  it('navigates only between calendar, task list, and export screens', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /연간 캘린더/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^업무목록$/i }));
    expect(screen.getByRole('heading', { name: /^업무목록$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^내보내기$/i }));
    expect(screen.getByRole('heading', { name: /^내보내기$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^캘린더$/i }));
    expect(screen.getByRole('heading', { name: /연간 캘린더/i })).toBeInTheDocument();
    expect(screen.queryByText(/올해 업무 실행판/i)).not.toBeInTheDocument();
  });
  it('keeps upload and bundles first, then a compact annual flow board before the month calendar', () => {
    seedTasksForCalendar([
      { title: '연구학교 3월 계획', start_date: '2026-03-05', group_name: '연구학교', group_color: '#9a0002' },
      { title: '연구학교 3월 품의', start_date: '2026-03-12', group_name: '연구학교', group_color: '#9a0002', category: '품의' },
      { title: '연구학교 4월 결과', start_date: '2026-04-02', group_name: '연구학교', group_color: '#9a0002', category: '결과보고' },
      { title: '안전교육 5월 계획', start_date: '2026-05-11', group_name: '안전교육', group_color: '#2563eb' },
      { title: '범위 밖 업무', start_date: '2027-03-01', group_name: '안전교육' },
    ]);
    render(<App />);

    const scrollSpy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: scrollSpy, configurable: true });
    const upload = screen.getByRole('region', { name: /PDF 업로드와 업무묶음 관리/i });
    const overview = screen.getByRole('region', { name: /연간 업무 흐름판/i });
    const calendar = screen.getByRole('region', { name: /월별 캘린더 본문/i });
    expect(upload.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(overview.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(within(overview).getByRole('heading', { name: /^연간 흐름$/i })).toBeInTheDocument();
    expect(within(overview).getByText(/월 클릭 → 아래 달력/i)).toBeInTheDocument();
    expect(within(overview).queryByText(/인쇄물 같은 월별 리본/i)).not.toBeInTheDocument();
    expect(within(overview).queryByText(/리본 = 해당 월의 계획·품의·결과보고 건수/i)).not.toBeInTheDocument();
    const monthRibbon = within(overview).getByLabelText(/월별 업무량 리본/i);
    expect(within(monthRibbon).getAllByRole('button')).toHaveLength(14);
    expect(within(overview).queryByText(/2026\.03|2027\.02|27\.2월/i)).not.toBeInTheDocument();
    const marchButton = within(overview).getByRole('button', { name: /올해 3월 보기 · 2건/i });
    expect(within(marchButton).getByText('3월')).toHaveClass('text-[13px]');
    expect(within(marchButton).getByText('2')).toHaveClass('font-display');
    expect(within(marchButton).getByText('건')).toHaveClass('text-[11px]');
    expect(within(overview).getByRole('button', { name: /다음해 2월 보기 · 0건/i })).toBeInTheDocument();
    expect(within(overview).getAllByText('연구학교').length).toBeGreaterThan(0);
    expect(within(overview).getByLabelText(/연구학교 올해 3월 2건/i)).toHaveStyle({ borderColor: '#9a0002' });
    expect(within(overview).getByLabelText(/안전교육 올해 5월 1건/i)).toHaveTextContent('1');
    expect(within(overview).getByLabelText(/연구학교 올해 1월 0건/i)).toHaveTextContent('0');
    expect(within(overview).getByLabelText(/안전교육 다음해 2월 0건/i)).toHaveTextContent('0');
    const bundleDistribution = within(overview).getByLabelText(/업무묶음별 월분포표/i).firstElementChild;
    expect(bundleDistribution).toHaveClass('min-w-[860px]');
    expect(bundleDistribution).not.toHaveClass('min-w-[1100px]');

    fireEvent.click(within(overview).getByRole('button', { name: /올해 4월 보기 · 1건/i }));
    expect(within(calendar).getByRole('region', { name: /2026년 4월 캘린더/i })).toBeInTheDocument();
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('keeps calendar controls simple: no visible years, simple ICS label, and Plus Minus memo wording', () => {
    seedTasksForCalendar([
      { title: 'Plus Minus 확인 업무', start_date: '2026-05-11', successor_memo: 'Plus: 일정이 명확함' },
    ]);
    render(<App />);

    expect(screen.getByRole('button', { name: /^캘린더 내보내기\(ICS\)$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /1월~다음해 2월 ICS/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/연도 선택/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/올해 2026|내년 2027/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^업무목록$/i }));
    expect(screen.queryByRole('complementary', { name: /업무목록 Plus Minus 메모/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/legacy successor memo/i)).not.toBeInTheDocument();
  });

  it('uses an obvious single-month pager instead of a clipped horizontal calendar', () => {
    seedTasksForCalendar([
      { title: '1월 계획', start_date: '2026-01-10' },
      { title: '다음해 2월 결과보고', start_date: '2027-02-10' },
      { title: '범위 밖 업무', start_date: '2027-03-01' },
    ]);
    render(<App />);

    expect(screen.getByText(/올해 1월부터 다음해 2월까지/i)).toBeInTheDocument();
    expect(screen.queryByText(/2026년 1월부터 2027년 2월까지/i)).not.toBeInTheDocument();
    showMonth(1);
    const calendar = screen.getByRole('region', { name: /월별 캘린더 본문/i });
    expect(within(calendar).getByRole('region', { name: /2026년 1월 캘린더/i })).toBeInTheDocument();
    expect(within(calendar).queryByRole('region', { name: /2026년 12월 캘린더/i })).not.toBeInTheDocument();
    expect(within(calendar).getByRole('button', { name: /2026-01-10 날짜칸 1건/i })).toBeInTheDocument();
    expect(within(calendar).getByRole('grid', { name: /2026년 1월 날짜표/i })).toHaveClass('grid-cols-7');
    expect(within(calendar).getByRole('region', { name: /2026년 1월 캘린더/i })).not.toHaveClass('w-[960px]');

    const expandButton = within(calendar).getByRole('button', { name: /연간캘린더 크게 보기/i });
    const monthControlButtons = within(expandButton.parentElement as HTMLElement).getAllByRole('button');
    expect(monthControlButtons[monthControlButtons.length - 1]).toHaveTextContent(/연간캘린더 크게 보기/i);

    expect(screen.getByRole('button', { name: /이전 달/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /다음 달/i }));
    expect(within(calendar).getByRole('region', { name: /2026년 2월 캘린더/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /마지막 달 다음해 2월 보기/i }));
    expect(within(calendar).getByRole('button', { name: /2027-02-10 날짜칸 1건/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다음 달/i })).toBeDisabled();
    expect(within(calendar).queryByRole('region', { name: /2027년 3월 캘린더/i })).not.toBeInTheDocument();
  });

  it('fills the monthly calendar with muted previous and next month dates', () => {
    seedTasksForCalendar([
      { title: '전달 말일 업무', start_date: '2026-04-30' },
      { title: '이번달 업무', start_date: '2026-05-11' },
      { title: '다음달 첫날 업무', start_date: '2026-06-01' },
    ]);
    render(<App />);

    showMonth(5);
    const calendar = screen.getByRole('region', { name: /월별 캘린더 본문/i });
    const grid = within(calendar).getByRole('grid', { name: /2026년 5월 날짜표/i });
    expect(within(grid).getAllByRole('button', { name: /날짜칸/i })).toHaveLength(42);

    const previousDay = within(grid).getByRole('button', { name: /2026-04-30 전달 날짜칸 1건/i });
    expect(previousDay).toHaveClass('opacity-45');
    expect(within(previousDay).getByText('30')).toBeInTheDocument();
    expect(within(previousDay).getByRole('button', { name: /전달 말일 업무 연간 업무 이동/i })).toBeInTheDocument();

    const currentDay = within(grid).getByRole('button', { name: /2026-05-11 날짜칸 1건/i });
    expect(currentDay).not.toHaveClass('opacity-45');

    const nextDay = within(grid).getByRole('button', { name: /2026-06-01 다음달 날짜칸 1건/i });
    expect(nextDay).toHaveClass('opacity-45');
    expect(within(nextDay).getByText('1')).toBeInTheDocument();
    expect(within(nextDay).getByRole('button', { name: /다음달 첫날 업무 연간 업무 이동/i })).toBeInTheDocument();

    fireEvent.click(nextDay);
    const selectedNextDay = within(grid).getByRole('button', { name: /2026-06-01 다음달 날짜칸 1건/i });
    expect(selectedNextDay).toHaveClass('opacity-45');
    expect(screen.getByRole('complementary', { name: /선택 날짜 상세/i })).toHaveTextContent('2026-06-01');
  });

  it('defaults the monthly calendar and selected date to today even when stored tasks are in another year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 6, 9, 0, 0));
    seedTasksForCalendar([
      { title: '지난해 업무', start_date: '2025-03-10' },
      { title: '다음해 업무', start_date: '2027-09-10' },
    ]);
    render(<App />);

    const calendar = screen.getByRole('region', { name: /월별 캘린더 본문/i });
    expect(within(calendar).getByRole('region', { name: /2026년 7월 캘린더/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /선택 날짜 상세/i })).toHaveTextContent('2026-07-06');
  });

  it('lets teachers move the calendar year and exports ICS for the selected year range', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 6, 6, 9, 0, 0));
    const download = installDownloadCapture();
    seedTasksForCalendar([
      { title: '오늘 기준 연도 업무', start_date: '2027-07-06' },
      { title: '다음 선택 연도 업무', start_date: '2028-03-01' },
      { title: '다음 선택 연도 끝 업무', start_date: '2029-02-10' },
      { title: '범위 밖 업무', start_date: '2029-03-01' },
    ]);
    render(<App />);

    expect(screen.getByText(/2027년 1월 ~ 2028년 2월/i)).toBeInTheDocument();
    const calendar = screen.getByRole('region', { name: /월별 캘린더 본문/i });
    expect(within(calendar).getByRole('region', { name: /2027년 7월 캘린더/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /선택 날짜 상세/i })).toHaveTextContent('2027-07-06');

    fireEvent.click(screen.getByRole('button', { name: /다음 해/i }));
    expect(screen.getByText(/2028년 1월 ~ 2029년 2월/i)).toBeInTheDocument();
    expect(within(calendar).getByRole('region', { name: /2028년 1월 캘린더/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^캘린더 내보내기\(ICS\)$/i }));

    expect(download.getFilename()).toBe('modoo-insu-calendar-2028.ics');
    const ics = unfoldIcs(await download.getText());
    expect(ics).toContain('SUMMARY:다음 선택 연도 업무');
    expect(ics).toContain('SUMMARY:다음 선택 연도 끝 업무');
    expect(ics).not.toContain('SUMMARY:오늘 기준 연도 업무');
    expect(ics).not.toContain('SUMMARY:범위 밖 업무');

    fireEvent.click(screen.getByRole('button', { name: /오늘 기준 연도로 이동/i }));
    expect(screen.getByText(/2027년 1월 ~ 2028년 2월/i)).toBeInTheDocument();
    expect(within(calendar).getByRole('region', { name: /2027년 7월 캘린더/i })).toBeInTheDocument();
  });

  it('opens the large annual calendar from the monthly calendar and moves tasks there by drag and drop', () => {
    seedTasksForCalendar([
      { id: 'large-drag', title: '큰 달력 이동 업무', start_date: '2026-05-11', group_name: '큰달력', group_color: '#2563eb' },
    ]);
    render(<App />);

    const monthlyCalendar = screen.getByRole('region', { name: /월별 캘린더 본문/i });
    fireEvent.click(within(monthlyCalendar).getByRole('button', { name: /연간캘린더 크게 보기/i }));
    const dialog = screen.getByRole('dialog', { name: /연간캘린더 크게 보기/i });
    expect(dialog).toHaveClass('fixed');
    expect(dialog).toHaveClass('bg-background');
    const largeGrid = within(dialog).getByLabelText(/큰 연간 월력 넉넉한 그리드/i);
    expect(largeGrid).toHaveClass('grid-cols-1');
    expect(largeGrid).toHaveClass('xl:grid-cols-2');
    expect(largeGrid).not.toHaveClass('grid-cols-3');
    const may = within(dialog).getByRole('region', { name: /2026년 5월 큰 월력/i });
    expect(may).toHaveClass('min-h-[520px]');
    expect(may).not.toHaveClass('overflow-y-auto');
    const sourceDay = within(may).getByRole('button', { name: /2026-05-11 큰 연간 날짜칸 1건/i });
    expect(sourceDay).toHaveClass('min-h-28');
    const taskButton = within(sourceDay).getByRole('button', { name: /큰 달력 이동 업무 큰 연간 업무 이동/i });
    fireEvent.dragStart(taskButton);
    fireEvent.drop(within(may).getByRole('button', { name: /2026-05-12 큰 연간 날짜칸 0건/i }));

    const movedDay = within(may).getByRole('button', { name: /2026-05-12 큰 연간 날짜칸 1건/i });
    expect(within(movedDay).getAllByText(/큰 달력 이동 업무/i).length).toBeGreaterThan(0);
    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks[0]).toEqual(expect.objectContaining({ start_date: '2026-05-12' }));
  });

  it('shows full calendar task details on hover/focus without reference-location text', () => {
    seedTasksForCalendar([
      {
        id: 'hover-task',
        title: '아주 긴 공문 제목 전체가 호버 카드에 보여야 함',
        start_date: '2026-05-11',
        source_doc: 'SAMPLE-HOVER-001',
        owner: '담당자',
        reference_location: '숨겨질 참고 위치',
        group_name: '호버업무',
        group_color: '#2563eb',
        successor_memo: 'Plus: 미리 준비',
      },
    ]);
    render(<App />);

    showMonth(5);
    const may = screen.getByRole('region', { name: /2026년 5월 연간 캘린더/i });
    const taskButton = within(may).getByRole('button', { name: /아주 긴 공문 제목 전체가 호버 카드에 보여야 함 연간 업무 이동/i });
    fireEvent.mouseEnter(taskButton);
    const hoverCard = within(taskButton).getByLabelText(/아주 긴 공문 제목 전체가 호버 카드에 보여야 함 업무 카드 미리보기/i);
    expect(hoverCard).toHaveTextContent(/아주 긴 공문 제목 전체가 호버 카드에 보여야 함/i);
    expect(hoverCard).toHaveTextContent(/SAMPLE-HOVER-001/);
    expect(hoverCard).toHaveTextContent(/담당자/);
    expect(hoverCard).toHaveTextContent(/Plus: 미리 준비/);
    expect(hoverCard).not.toHaveTextContent(/숨겨질 참고 위치|참고자료 위치/);

    fireEvent.click(screen.getAllByRole('button', { name: /연간캘린더 크게 보기/i })[0]);
    const dialog = screen.getByRole('dialog', { name: /연간캘린더 크게 보기/i });
    const largeTask = within(dialog).getByRole('button', { name: /아주 긴 공문 제목 전체가 호버 카드에 보여야 함 큰 연간 업무 이동/i });
    fireEvent.focus(largeTask);
    const largeHoverCard = within(largeTask).getByLabelText(/업무 카드 미리보기/i);
    expect(largeHoverCard).toHaveTextContent(/아주 긴 공문 제목 전체가 호버 카드에 보여야 함/i);
    expect(largeTask).toHaveClass('hover:z-50');
    expect(largeTask).toHaveClass('focus:z-50');
    expect(largeHoverCard).toHaveClass('z-[999]');
  });

  it('keeps bundle Plus/Minus memo fields empty by default with short placeholder copy', () => {
    seedTasksForCalendar([
      { id: 'empty-bundle-memo', title: '메모 기본값 확인 업무', start_date: '2026-05-11', group_name: '메모확인', group_color: '#9a0002' },
    ]);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^업무목록$/i }));
    const plusMemo = screen.getByLabelText(/메모확인 Plus 메모/i) as HTMLTextAreaElement;
    const minusMemo = screen.getByLabelText(/메모확인 Minus 메모/i) as HTMLTextAreaElement;

    expect(plusMemo).toHaveValue('');
    expect(minusMemo).toHaveValue('');
    expect(plusMemo).toHaveAttribute('placeholder', '좋았던 점');
    expect(minusMemo).toHaveAttribute('placeholder', '아쉬웠던 점');
  });

  it('stacks the selected-date detail panel below the calendar until very wide screens', () => {
    seedTasksForCalendar([{ title: '상세 확인 업무', start_date: '2026-05-11' }]);
    render(<App />);

    const layout = screen.getByTestId('calendar-detail-layout');
    expect(layout).toHaveClass('grid-cols-1');
    expect(layout).toHaveClass('2xl:grid-cols-[minmax(0,1fr)_340px]');
    expect(layout).not.toHaveClass('xl:grid-cols-[minmax(0,1fr)_340px]');
    const detailPanel = screen.getByRole('complementary', { name: /선택 날짜 상세/i });
    expect(detailPanel).toHaveClass('2xl:sticky');
  });

  it('reveals overflow task titles only by click and lets hidden titles move by drag and drop', () => {
    seedTasksForCalendar([
      { id: 'visible-1', title: '첫 번째 계획', category: '계획' },
      { id: 'visible-2', title: '두 번째 품의', category: '품의' },
      { id: 'hidden-1', title: '숨은 결과보고', category: '결과보고' },
      { id: 'hidden-2', title: '숨은 계획', category: '계획' },
    ]);
    render(<App />);

    showMonth(5);
    const may = screen.getByRole('region', { name: /2026년 5월 연간 캘린더/i });
    const may11 = within(may).getByRole('button', { name: /2026-05-11 날짜칸 4건/i });
    const overflow = within(may11).getByRole('button', { name: /2026-05-11 숨은 공문 2건 보기/i });
    expect(within(may11).queryByRole('button', { name: /숨은 결과보고 연간 업무 이동/i })).not.toBeInTheDocument();

    fireEvent.mouseEnter(overflow);
    expect(within(may11).queryByRole('button', { name: /숨은 결과보고 연간 업무 이동/i })).not.toBeInTheDocument();
    fireEvent.click(overflow);
    const hiddenTask = within(may11).getByRole('button', { name: /숨은 결과보고 연간 업무 이동/i });
    fireEvent.click(within(may11).getByRole('button', { name: /2026-05-11 숨은 공문 2건 닫기/i }));
    expect(within(may11).queryByRole('button', { name: /숨은 결과보고 연간 업무 이동/i })).not.toBeInTheDocument();
    fireEvent.click(within(may11).getByRole('button', { name: /2026-05-11 숨은 공문 2건 보기/i }));
    const reopenedHiddenTask = within(may11).getByRole('button', { name: /숨은 결과보고 연간 업무 이동/i });
    fireEvent.dragStart(reopenedHiddenTask);
    fireEvent.drop(within(may).getByRole('button', { name: /2026-05-12 날짜칸 0건/i }));

    const movedDay = within(may).getByRole('button', { name: /2026-05-12 날짜칸 1건/i });
    expect(within(movedDay).getAllByText(/숨은 결과보고/i).length).toBeGreaterThan(0);
  });

  it('truncates long calendar titles and colors cards by PDF bundle group', () => {
    seedTasksForCalendar([
      {
        title: '2026학년도 학교안전사고 예방교육 운영 계획 안내',
        category: '계획',
        group_name: '안전교육',
        group_color: '#2563eb',
      },
    ]);
    render(<App />);

    showMonth(5);
    const may = screen.getByRole('region', { name: /2026년 5월 연간 캘린더/i });
    const may11 = within(may).getByRole('button', { name: /2026-05-11 날짜칸 1건/i });
    const taskButton = within(may11).getByRole('button', { name: /2026학년도 학교안전사고 예방교육 운영 계획 안내 연간 업무 이동/i });
    expect(within(taskButton).getByText('2026학년도 학교…')).toBeInTheDocument();
    expect(within(taskButton).getByText('2026학년도 학교…')).toHaveStyle({ WebkitLineClamp: '2' });
    expect(taskButton).toHaveClass('text-xs');
    expect(taskButton).toHaveStyle({ borderColor: '#2563eb' });
    expect(taskButton).toHaveStyle({ color: 'var(--color-foreground)' });
    expect(within(taskButton).queryByText(/^업무$/)).not.toBeInTheDocument();
  });

  it('opens simple large views for the quadrant board and the spacious annual calendar', () => {
    seedTasksForCalendar([
      { id: 'q-1', title: '3월 업무', category: '계획', group_name: '공무', group_color: '#2563eb', start_date: '2026-03-01' },
      { id: 'q-2', title: '4월 업무', category: '운영', group_name: '공무', group_color: '#2563eb', start_date: '2026-04-01' },
      { id: 'q-3', title: '5월 업무', category: '결과보고', group_name: '공무', group_color: '#2563eb', start_date: '2026-05-01' },
    ]);
    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: /연간캘린더 크게 보기/i })[0]);
    const annualDialog = screen.getByRole('dialog', { name: /연간캘린더 크게 보기/i });
    expect(within(annualDialog).getByRole('region', { name: /2026년 1월 큰 월력/i })).toBeInTheDocument();
    expect(within(annualDialog).getByRole('region', { name: /2026년 12월 큰 월력/i })).toBeInTheDocument();
    expect(within(annualDialog).getByText(/월간 캘린더처럼 날짜칸을 크게/i)).toBeInTheDocument();
    fireEvent.click(within(annualDialog).getByRole('button', { name: /닫기/i }));

    fireEvent.click(screen.getByRole('button', { name: /업무지형도 크게 보기/i }));
    const quadrantDialog = screen.getByRole('dialog', { name: /업무지형도 크게 보기/i });
    const largeScatter = within(quadrantDialog).getByLabelText(/큰 업무 지형도 산점도/i);
    expect(largeScatter).toBeInTheDocument();
    expect(within(largeScatter).getByRole('button', { name: /1번 공무 업무 지형도 업무묶음/i })).toHaveTextContent('1');
    expect(within(largeScatter).queryByText(/^공무$/i)).not.toBeInTheDocument();
    expect(within(quadrantDialog).getByRole('table', { name: /업무 지형도 번호 범례/i })).toHaveTextContent(/공무/);
  });

  it('replaces workflow cards with a bundle quadrant board and keeps forbidden axis wording out', () => {
    seedTasksForCalendar([
      { title: '교육과정 계획', category: '계획', group_name: '교육과정', group_color: '#9a0002', start_date: '2026-03-01' },
      { title: '교육과정 품의', category: '품의', group_name: '교육과정', group_color: '#9a0002', start_date: '2026-05-01' },
      { title: '교육과정 결과', category: '결과보고', group_name: '교육과정', group_color: '#9a0002', start_date: '2026-09-01' },
      { title: '안전교육 계획', category: '계획', group_name: '안전교육', group_color: '#2563eb', start_date: '2026-04-01' },
      { title: '안전교육 품의', category: '품의', group_name: '안전교육', group_color: '#2563eb', start_date: '2026-04-02' },
      { title: '운영 문서', category: '운영', group_name: '교육과정', group_color: '#9a0002', start_date: '2026-10-01' },
    ]);
    render(<App />);

    expect(screen.queryByRole('region', { name: /업무흐름 카드/i })).not.toBeInTheDocument();
    const quadrant = screen.getByRole('region', { name: /업무 지형도/i });
    expect(within(quadrant).getByText(/시기 집중 ↔ 연중 지속/i)).toBeInTheDocument();
    expect(within(quadrant).getByText(/공문 적음 ↕ 공문 많음/i)).toBeInTheDocument();
    expect(within(quadrant).queryByText(/난이도|AI 분석/i)).not.toBeInTheDocument();
    expect(within(quadrant).getAllByText(/연중 핵심 업무/i).length).toBeGreaterThan(0);
    expect(within(quadrant).getAllByText(/시기 집중 업무/i).length).toBeGreaterThan(0);
    const scatter = within(quadrant).getByLabelText(/업무묶음 사분면 산점도/i);
    expect(within(scatter).getByRole('button', { name: /1번 교육과정 업무 지형도 업무묶음/i })).toHaveTextContent('1');
    expect(within(scatter).getByRole('button', { name: /2번 안전교육 업무 지형도 업무묶음/i })).toHaveTextContent('2');
    expect(within(scatter).queryByText(/^교육과정$/i)).not.toBeInTheDocument();
    expect(within(scatter).queryByText(/^안전교육$/i)).not.toBeInTheDocument();
    const legend = within(quadrant).getByRole('table', { name: /업무 지형도 번호 범례/i });
    expect(within(legend).getByText('교육과정')).toBeInTheDocument();
    expect(within(legend).getByText('안전교육')).toBeInTheDocument();
    expect(within(quadrant).queryByText(/^운영$/i)).not.toBeInTheDocument();
  });

  it('lets teachers click a calendar task and drag it to another day', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(extractPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);

    await uploadSamplePdfToBoard();

    showMonth(5);
    const may = screen.getByRole('region', { name: /2026년 5월 연간 캘린더/i });
    const may11 = within(may).getByRole('button', { name: /2026-05-11 날짜칸 1건/i });
    const taskButton = within(may11).getByRole('button', { name: /2026\. 학교 안전 점검 계획 안내 연간 업무 이동/i });
    fireEvent.click(taskButton);
    expect(screen.getByText(/선택 날짜 상세/i)).toBeInTheDocument();
    expect(screen.getAllByText(/업무지원과-0000/i).length).toBeGreaterThan(0);

    fireEvent.dragStart(taskButton);
    fireEvent.drop(within(may).getByRole('button', { name: /2026-05-12 날짜칸 0건/i }));

    const movedDay = within(may).getByRole('button', { name: /2026-05-12 날짜칸 1건/i });
    expect(within(movedDay).getAllByText(/2026\. 학교 안…/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/2026-05-12로 이동됨/i)).toBeInTheDocument();
  });

  it('keeps a user-named group after date drag and drop without manual category controls', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(extractPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);
    await uploadSamplePdfToBoard();

    showMonth(5);
    const may = screen.getByRole('region', { name: /2026년 5월 연간 캘린더/i });
    const may11 = within(may).getByRole('button', { name: /2026-05-11 날짜칸 1건/i });
    const taskButton = within(may11).getByRole('button', { name: /2026\. 학교 안전 점검 계획 안내 연간 업무 이동/i });
    fireEvent.click(taskButton);
    expect(screen.queryByLabelText(/업무묶음 선택/i)).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/단계: 계획/i).length).toBeGreaterThan(0);

    const updatedTaskButton = within(may11).getByRole('button', { name: /2026\. 학교 안전 점검 계획 안내 연간 업무 이동/i });
    fireEvent.dragStart(updatedTaskButton);
    fireEvent.drop(within(may).getByRole('button', { name: /2026-05-12 날짜칸 0건/i }));

    const movedDay = within(may).getByRole('button', { name: /2026-05-12 날짜칸 1건/i });
    expect(within(movedDay).getByLabelText(/단계: 계획/i)).toBeInTheDocument();
    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks).toEqual([
      expect.objectContaining({
        group_name: '계기교육',
        group_color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        start_date: '2026-05-12',
      }),
    ]);
  });

it('opens the right-side quadrant detail for a clicked bundle', () => {
    seedTasksForCalendar([
      { id: 'plan-1', title: '체험학습 운영 계획', category: '계획', group_name: '체험학습', group_color: '#2563eb', start_date: '2026-04-30' },
      { id: 'approval-1', title: '체험학습 품의', category: '품의', group_name: '체험학습', group_color: '#2563eb', start_date: '2026-05-07' },
      { id: 'result-1', title: '안전교육 결과보고', category: '결과보고', group_name: '안전교육', group_color: '#059669', start_date: '2026-06-12' },
    ]);

    render(<App />);

    const quadrant = screen.getByRole('region', { name: /업무 지형도/i });
    fireEvent.click(within(quadrant).getByRole('button', { name: /체험학습 업무 지형도 업무묶음/i }));

    const detail = within(quadrant).getByRole('complementary', { name: /업무 지형도 상세/i });
    expect(within(detail).getByText(/^체험학습$/i)).toBeInTheDocument();
    expect(within(detail).getByText(/업무 성격/i)).toBeInTheDocument();
    expect(within(detail).getByText(/가장 바쁜 때/i)).toBeInTheDocument();
    expect(within(detail).queryByText(/대표 업무/i)).not.toBeInTheDocument();
    expect(within(detail).queryByText(/체험학습 운영 계획/i)).not.toBeInTheDocument();
    expect(within(detail).queryByLabelText(/체험학습 운영 계획 Plus\/Minus 메모/i)).not.toBeInTheDocument();
    expect(within(detail).queryByText(/업무 상세 \/ PMI/i)).not.toBeInTheDocument();
    expect(within(detail).queryByText(/안전교육 결과보고/i)).not.toBeInTheDocument();
  });

  it('shows one editable Plus and Minus memo area per bundle with an explicit save button', () => {
    seedTasksForCalendar([
      { id: 'pmi-list-1', title: 'Plus Minus 계획', group_name: '생활지도긴업무묶음', group_color: '#2563eb', reference_location: '숨겨질 위치', successor_memo: 'Plus: 빨리 준비하면 좋음\nMinus: 예산 마감이 빠름\nInteresting: 다음 아이디어' },
      { id: 'pmi-list-2', title: 'Plus Minus 결과', group_name: '생활지도긴업무묶음', group_color: '#2563eb', start_date: '2026-06-11', successor_memo: 'Plus: 빨리 준비하면 좋음' },
    ]);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^업무목록$/i }));
    expect(screen.queryByRole('columnheader', { name: /참고자료 위치/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/숨겨질 위치/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Interesting/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/PMI/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Plus Minus 계획 Plus 메모/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Plus Minus 결과 Plus 메모/i)).not.toBeInTheDocument();

    const bundleCard = screen.getByRole('region', { name: /생활지도긴업무묶음 업무묶음 메모/i });
    expect(within(bundleCard).getByText(/2건/i)).toBeInTheDocument();
    expect(within(bundleCard).getByText(/Plus Minus 계획/i)).toBeInTheDocument();
    expect(within(bundleCard).getByText(/Plus Minus 결과/i)).toBeInTheDocument();
    expect(within(bundleCard).getByText(/작성 후 저장 버튼을 눌러야 반영됩니다/i)).toBeInTheDocument();
    const plusMemo = within(bundleCard).getByLabelText(/생활지도긴업무묶음 Plus 메모/i);
    const minusMemo = within(bundleCard).getByLabelText(/생활지도긴업무묶음 Minus 메모/i);
    const saveButton = within(bundleCard).getByRole('button', { name: /생활지도긴업무묶음 Plus\/Minus 저장/i });
    expect(plusMemo).toHaveValue('빨리 준비하면 좋음');
    expect(minusMemo).toHaveValue('예산 마감이 빠름');
    expect(saveButton).toBeDisabled();

    fireEvent.change(plusMemo, { target: { value: '꾸러미 전체 장점' } });
    fireEvent.blur(plusMemo);
    expect(saveButton).toBeEnabled();
    expect(within(bundleCard).getByText(/저장 전 변경사항 있음/i)).toBeInTheDocument();
    expect(JSON.parse(storage.get(BUNDLE_PMI_KEY) ?? '[]')).toEqual([]);

    fireEvent.change(minusMemo, { target: { value: '꾸러미 전체 주의점' } });
    fireEvent.click(saveButton);

    const storedBundleMemos = JSON.parse(storage.get(BUNDLE_PMI_KEY) ?? '[]');
    expect(storedBundleMemos).toEqual([
      expect.objectContaining({
        group_name: '생활지도긴업무묶음',
        pmi_plus: '꾸러미 전체 장점',
        pmi_minus: '꾸러미 전체 주의점',
      }),
    ]);
    expect(saveButton).toBeDisabled();
    expect(within(bundleCard).getByText(/저장 완료/i)).toBeInTheDocument();
    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks).toEqual([
      expect.objectContaining({ id: 'pmi-list-1', successor_memo: expect.stringContaining('Interesting') }),
      expect.objectContaining({ id: 'pmi-list-2', successor_memo: 'Plus: 빨리 준비하면 좋음' }),
    ]);
  });

  it('keeps task-list metadata on one line, centers key columns, and removes per-document edit buttons', () => {
    seedTasksForCalendar([
      {
        id: 'nowrap-1',
        title: '2026학년도 학교 안전 점검 계획 안내 매우 긴 제목도 한 줄로 확인',
        group_name: '안전교육',
        group_color: '#2563eb',
        start_date: '2026-05-11',
        source_doc: '업무지원과-0000',
        owner: '홍길동',
      },
    ]);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^업무목록$/i }));
    const dateCell = screen.getByText('2026-05-11').closest('td');
    const groupCell = screen.getAllByText('안전교육').map((element) => element.closest('td')).find(Boolean);
    const titleCell = screen.getByText('2026학년도 학교 안전 점검 계획 안내 매우 긴 제목도 한 줄로 확인').closest('td');
    const docCell = screen.getByText('업무지원과-0000').closest('td');
    const ownerCell = screen.getByText('홍길동').closest('td');
    const actionCell = screen.getByRole('button', { name: /^삭제$/i }).closest('td');

    expect(dateCell).toHaveClass('whitespace-nowrap');
    expect(docCell).toHaveClass('whitespace-nowrap');
    expect(ownerCell).toHaveClass('whitespace-nowrap');
    expect(groupCell).toHaveClass('text-center');
    expect(titleCell).toHaveClass('text-center');
    expect(titleCell).toHaveClass('whitespace-nowrap');
    expect(actionCell).toHaveClass('text-center');
    const archiveTable = actionCell?.closest('table');
    expect(archiveTable).toHaveClass('min-w-[900px]');
    expect(archiveTable).not.toHaveClass('min-w-[1180px]');
    expect(actionCell).toHaveClass('sticky');
    expect(actionCell).toHaveClass('right-0');
    expect(screen.queryByRole('button', { name: /수정/i })).not.toBeInTheDocument();
  });

it('lets teachers edit a selected calendar task from the detail panel', async () => {
    seedTasksForCalendar([
      {
        id: 'calendar-edit',
        title: '캘린더 수정 대상',
        start_date: '2026-05-11',
        source_doc: 'SAMPLE-EDIT-OLD',
        owner: '담당자',
        reference_location: '공유드라이브/기존',
        successor_memo: '기존 메모',
        priority: 'normal',
      },
    ]);
    render(<App />);

    showMonth(5);
    const may = screen.getByRole('region', { name: /2026년 5월 연간 캘린더/i });
    const may11 = within(may).getByRole('button', { name: /2026-05-11 날짜칸 1건/i });
    fireEvent.click(within(may11).getByRole('button', { name: /캘린더 수정 대상 연간 업무 이동/i }));
    const detailPanel = screen.getByRole('complementary', { name: /선택 날짜 상세/i });
    fireEvent.click(within(detailPanel).getByRole('button', { name: /캘린더 수정 대상 수정/i }));

    fireEvent.change(screen.getByLabelText(/수정 업무명/i), { target: { value: '캘린더에서 수정 완료' } });
    fireEvent.change(screen.getByLabelText(/수정 담당자/i), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByLabelText(/수정 문서번호/i), { target: { value: 'SAMPLE-EDIT-001' } });
    expect(screen.queryByLabelText(/수정 근거 위치/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/수정 날짜/i), { target: { value: '2026-05-12' } });
    fireEvent.change(screen.getByLabelText(/수정 Plus/i), { target: { value: '달력에서 바로 수정한 장점' } });
    fireEvent.change(screen.getByLabelText(/수정 Minus/i), { target: { value: '일정 촉박' } });
        fireEvent.click(screen.getByRole('button', { name: /수정 저장/i }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /업무 수정/i })).not.toBeInTheDocument());
    const may12 = within(may).getByRole('button', { name: /2026-05-12 날짜칸 1건/i });
    fireEvent.click(within(may12).getByRole('button', { name: /캘린더에서 수정 완료 연간 업무 이동/i }));
    expect(within(detailPanel).getByText(/SAMPLE-EDIT-001/i)).toBeInTheDocument();
    expect(within(detailPanel).getByText(/홍길동/i)).toBeInTheDocument();
    expect(within(detailPanel).queryByText(/참고자료 위치/i)).not.toBeInTheDocument();
    expect(within(detailPanel).queryByText(/공유드라이브\/수정/i)).not.toBeInTheDocument();
    expect(within(detailPanel).getByText(/Plus: 달력에서 바로 수정한 장점/i)).toBeInTheDocument();
    expect(within(detailPanel).getByText(/Minus: 일정 촉박/i)).toBeInTheDocument();
    expect(within(detailPanel).queryByText(/검토 대상 업무/i)).not.toBeInTheDocument();
    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks).toEqual([
      expect.objectContaining({
        id: 'calendar-edit',
        title: '캘린더에서 수정 완료',
        start_date: '2026-05-12',
        source_doc: 'SAMPLE-EDIT-001',
        owner: '홍길동',
        reference_location: '공유드라이브/기존',
        successor_memo: 'Plus: 달력에서 바로 수정한 장점\nMinus: 일정 촉박',
        priority: 'normal',
      }),
    ]);
  });

  it('counts user-facing successor memos rather than hidden legacy memo records in the export screen', () => {
    seedTasksForCalendar([
      { id: 'memo-1', title: '메모 있는 업무', successor_memo: '다음 담당자가 볼 Plus Minus 포스트잇 메모' },
      { id: 'memo-2', title: '메모 없는 업무', successor_memo: null },
    ]);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^내보내기$/i }));

    expect(screen.getByText(/업무 2건 · Plus\/Minus 메모 1건/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /메모 추가/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /메모 삭제/i })).not.toBeInTheDocument();
  });

it('shows PDF upload and bundle deletion side by side, then deletes one bundle only', () => {
    seedTasksForCalendar([
      { id: 'safe-1', title: '안전 점검 계획', group_name: '안전교육', group_color: '#2563eb', start_date: '2026-05-11' },
      { id: 'safe-2', title: '안전 결과보고', group_name: '안전교육', group_color: '#2563eb', start_date: '2026-05-12' },
      { id: 'curriculum-1', title: '교육과정 계획', group_name: '교육과정', group_color: '#059669', start_date: '2026-06-03' },
    ]);
    render(<App />);

    const uploadManager = screen.getByRole('region', { name: /PDF 업로드와 업무묶음 관리/i });
    expect(uploadManager).toHaveClass('items-stretch');
    const uploadCard = within(uploadManager).getByLabelText(/공문 PDF 업로드 카드/i);
    const bundleCard = within(uploadManager).getByLabelText(/업무묶음 관리 카드/i);
    expect(uploadCard).toHaveClass('h-full');
    expect(bundleCard).toHaveClass('h-full');
    expect(within(uploadManager).getByRole('heading', { name: /작년 공문 업로드/i })).toBeInTheDocument();
    expect(within(uploadManager).getByText(/업무묶음 관리/i)).toBeInTheDocument();
    expect(within(uploadManager).getByText(/안전교육/i)).toBeInTheDocument();
    expect(within(uploadManager).getByText(/2건/i)).toBeInTheDocument();

    fireEvent.click(within(uploadManager).getByRole('button', { name: /안전교육 업무묶음 삭제/i }));
    expect(within(uploadManager).getByText(/안전교육 2건 삭제 확인/i)).toBeInTheDocument();
    fireEvent.click(within(uploadManager).getByRole('button', { name: /안전교육 삭제 확정/i }));

    expect(within(uploadManager).queryByText(/안전교육/i)).not.toBeInTheDocument();
    expect(within(uploadManager).getByText(/교육과정/i)).toBeInTheDocument();
    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks).toEqual([expect.objectContaining({ group_name: '교육과정' })]);
  });

it('exports a local backup from the export screen without raw PDF text and imports it back', async () => {
    render(<App />);
    await uploadSamplePdfToBoard();
    fireEvent.click(screen.getByRole('button', { name: /^내보내기$/i }));
    const downloadCapture = installDownloadCapture();

    fireEvent.click(screen.getByRole('button', { name: /로컬 백업 저장/i }));
    const backupText = await downloadCapture.getText();
    const backup = JSON.parse(backupText);

    expect(backup).toEqual(expect.objectContaining({
      schemaVersion: 1,
      tasks: [expect.objectContaining({
        title: '2026. 학교 안전 점검 계획 안내',
        source_doc: '업무지원과-0000',
        owner: '담당자 확인',
        reference_location: 'K-에듀파인 또는 공문함',
        group_name: '계기교육',
        group_color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        successor_memo: null,
      })],
      memos: [],
    }));
    expect(backupText).not.toContain('%PDF-1.4');
    expect(backupText).not.toContain('documentLines');

    fireEvent.click(screen.getByRole('button', { name: /전체 초기화/i }));
    fireEvent.click(screen.getByRole('button', { name: /로컬 데이터 비우기 확인/i }));
    await waitFor(() => expect(JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}').tasks).toHaveLength(0));

    fireEvent.change(screen.getByLabelText(/로컬 백업 파일 선택/i), {
      target: { files: [new File([backupText], 'backup.json', { type: 'application/json' })] },
    });

    expect(await screen.findByText(/가져올 백업 확인/i)).toBeInTheDocument();
    expect(screen.getByText(/업무 1건 · Plus\/Minus 메모 0건/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /대체/i }));
    await waitFor(() => expect(JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}').tasks).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /^캘린더$/i }));
    showMonth(5);
    expect(screen.getAllByText(/2026\. 학교 안…/i).length).toBeGreaterThan(0);
    expect(downloadCapture.click).toHaveBeenCalled();
  });

  it('deduplicates same-name bundle Plus/Minus memos when appending a backup', async () => {
    storage.set(SNAPSHOT_KEY, JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-06-30T00:00:00.000Z',
      tasks: [{
        id: 'existing-safety-task',
        title: '기존 안전 계획',
        description: '기존 업무',
        start_date: '2026-05-11',
        end_date: null,
        category: '계획',
        group_name: '안전',
        group_color: '#2563eb',
        priority: 'normal',
        source_doc: null,
        owner: null,
        reference_location: null,
        successor_memo: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }],
      memos: [],
      bundlePmiMemos: [{ group_name: '안전', pmi_plus: '기존 장점', pmi_minus: '기존 주의점', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' }],
    }));
    storage.set(BUNDLE_PMI_KEY, JSON.stringify([{ group_name: '안전', pmi_plus: '기존 장점', pmi_minus: '기존 주의점', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' }]));
    const importedBackup = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-07-01T00:00:00.000Z',
      tasks: [{
        id: 'imported-safety-task',
        title: '가져온 안전 결과',
        description: '가져온 업무',
        start_date: '2026-06-11',
        end_date: null,
        category: '결과보고',
        group_name: ' 안전 ',
        group_color: '#059669',
        priority: 'normal',
        source_doc: null,
        owner: null,
        reference_location: null,
        successor_memo: null,
        created_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
      }],
      memos: [],
      bundlePmiMemos: [{ group_name: ' 안전 ', pmi_plus: '가져온 장점', pmi_minus: '가져온 주의점', created_at: '2026-02-01T00:00:00.000Z', updated_at: '2026-03-01T00:00:00.000Z' }],
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^내보내기$/i }));
    fireEvent.change(screen.getByLabelText(/로컬 백업 파일 선택/i), {
      target: { files: [new File([importedBackup], 'same-group-backup.json', { type: 'application/json' })] },
    });

    expect(await screen.findByText(/가져올 백업 확인/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /기존에 추가/i }));

    await waitFor(() => expect(JSON.parse(storage.get(TASKS_KEY) ?? '[]')).toHaveLength(2));
    expect(JSON.parse(storage.get(BUNDLE_PMI_KEY) ?? '[]')).toEqual([
      expect.objectContaining({ group_name: '안전', pmi_plus: '가져온 장점', pmi_minus: '가져온 주의점', updated_at: '2026-03-01T00:00:00.000Z' }),
    ]);
  });

  it('clears bundle-level Plus and Minus memo storage when local data is emptied', async () => {
    storage.set(SNAPSHOT_KEY, JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-06-30T00:00:00.000Z',
      tasks: [{
        id: 'clear-bundle-task',
        title: '생활지도 계획',
        description: '정리 대상',
        start_date: '2026-05-11',
        end_date: null,
        category: '계획',
        group_name: '생활지도',
        group_color: '#2563eb',
        priority: 'normal',
        source_doc: null,
        owner: null,
        reference_location: null,
        successor_memo: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }],
      memos: [],
      bundlePmiMemos: [{
        group_name: '생활지도',
        pmi_plus: '꾸러미 장점',
        pmi_minus: '꾸러미 주의점',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }],
    }));
    storage.set(BUNDLE_PMI_KEY, JSON.stringify([{ group_name: '생활지도', pmi_plus: '꾸러미 장점', pmi_minus: '꾸러미 주의점', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }]));

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^내보내기$/i }));
    fireEvent.click(screen.getByRole('button', { name: /전체 초기화/i }));
    fireEvent.click(screen.getByRole('button', { name: /로컬 데이터 비우기 확인/i }));

    await waitFor(() => expect(JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}').tasks).toHaveLength(0));
    expect(JSON.parse(storage.get(BUNDLE_PMI_KEY) ?? '[]')).toEqual([]);
    expect(JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}').bundlePmiMemos).toEqual([]);
  });

  it('downloads a successor handoff package with memo, reference, group, and checklist fields', async () => {
    storage.set(SNAPSHOT_KEY, JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-06-30T00:00:00.000Z',
      tasks: [
        {
          id: 'task-1',
          title: '학교 안전 점검 계획 안내',
          description: '업무 카드 메모',
          start_date: '2026-05-11',
          end_date: null,
          category: '계획',
          group_name: '안전',
          group_color: '#dc2626',
          priority: 'high',
          source_doc: '업무지원과-0000',
          owner: '담당자 확인',
          reference_location: 'K-에듀파인 또는 공문함',
          successor_memo: '전년도 체크리스트 확인',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      memos: [
        {
          id: 'memo-1',
          task_id: 'task-1',
          content: '포스트잇형 참고 메모',
          color: 'yellow',
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ],
    }));
    const downloadCapture = installDownloadCapture();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^내보내기$/i }));
    expect(screen.getByRole('heading', { name: /업무묶음별 Plus\/Minus 정리/i })).toBeInTheDocument();
    expect(screen.getByText(/업무묶음마다 Plus \/ Minus/i)).toBeInTheDocument();
    expect(screen.queryByText(/DOCX 형식은 업무묶음별 1쪽 월별 업무분포표/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/HWPX는 추후 지원 예정/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/로컬 스냅샷 v1/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /업무묶음 Markdown 저장/i }));
    const markdown = await downloadCapture.getText();

    expect(downloadCapture.getFilename()).toBe('modoo-insu-group-handoff.md');
    expect(markdown).toContain('# 업무묶음 Plus\/Minus 정리');
    expect(markdown).toContain('## 안전 Plus\/Minus 메모');
    expect(markdown).toContain('- 기간: 2026-05-11');
    expect(markdown).toContain('- 진행 요약: 완료 0건 / 진행 1건');
    expect(markdown).toContain('- [ ] 학교 안전 점검 계획 안내 · 2026-05-11 · 계획');
    expect(markdown).toContain('- 문서번호·기안일: 업무지원과-0000 / 2026-05-11');
    expect(markdown).not.toContain('문서/자료 위치');
    expect(markdown).not.toContain('K-에듀파인 또는 공문함');
    expect(markdown).toContain('Plus/Minus 메모');
    expect(markdown).toContain('Plus: 전년도 체크리스트 확인');
    expect(markdown).not.toContain('- 포스트잇: 포스트잇형 참고 메모');
    expect(markdown).toContain('원본 PDF 파일이나 원문 추출 텍스트는 포함하지 않습니다');
    expect(markdown).not.toContain('## 학교 안전 점검 계획 안내');
  });

  it('downloads a real DOCX group handoff file from the export screen', async () => {
    storage.set(SNAPSHOT_KEY, JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-06-30T00:00:00.000Z',
      tasks: [
        {
          id: 'task-docx',
          title: '통일교육 운영 계획',
          description: '업무 카드 메모',
          start_date: '2026-03-10',
          end_date: null,
          category: '계획',
          group_name: '통일교육',
          group_color: '#059669',
          priority: 'normal',
          source_doc: '업무지원과-0000',
          owner: '담당자 확인',
          reference_location: '공문함 > 통일교육',
          successor_memo: '3월 첫째 주 일정 확인',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      memos: [
        {
          id: 'memo-docx',
          task_id: 'task-docx',
          content: '외부 강사 섭외는 최소 2주 전 확인',
          color: 'yellow',
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ],
    }));
    const downloadCapture = installDownloadCapture();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^내보내기$/i }));
    fireEvent.click(screen.getByRole('button', { name: /업무묶음 DOCX 생성/i }));

    await waitFor(() => expect(downloadCapture.getFilename()).toBe('modoo-insu-group-handoff.docx'));
    const blob = downloadCapture.getBlob();
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(blob.size).toBeGreaterThan(1000);
    expect(screen.getByText(/현재 업무 1건 · Plus\/Minus 메모 1건/i)).toBeInTheDocument();
  });

it('shows text group labels across calendar and task list views', async () => {
    render(<App />);
    await uploadSamplePdfToBoard();

    showMonth(5);
    const may = screen.getByRole('region', { name: /2026년 5월 연간 캘린더/i });
    expect(within(may).getAllByLabelText(/단계: 계획/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /^업무목록$/i }));
    expect(screen.getByRole('columnheader', { name: /업무묶음/i })).toBeInTheDocument();
    const groupPills = screen.getAllByLabelText(/업무묶음: 계기교육/i);
    expect(groupPills.length).toBeGreaterThan(0);
    expect(groupPills[0]).toHaveClass('font-sans');
    expect(groupPills[0]).not.toHaveClass('font-mono');
  });

  it('exports visible annual calendar tasks as an ICS calendar file', async () => {
    render(<App />);
    await uploadSamplePdfToBoard();
    const downloadCapture = installDownloadCapture();

    fireEvent.click(screen.getByRole('button', { name: /캘린더 내보내기\(ICS\)/i }));
    const ics = await downloadCapture.getText();
    const unfolded = unfoldIcs(ics);

    expect(unfolded).toContain('BEGIN:VCALENDAR');
    expect(unfolded).toContain('VERSION:2.0');
    expect(unfolded).toContain('BEGIN:VEVENT');
    expect(unfolded).toContain('SUMMARY:2026. 학교 안전 점검 계획 안내');
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20260511');
    expect(unfolded).toContain('DTEND;VALUE=DATE:20260512');
    expect(unfolded).toContain('DESCRIPTION:문서번호: 업무지원과-0000');
    expect(unfolded).not.toContain('documentLines');
    expect(downloadCapture.click).toHaveBeenCalled();
  });

  it('exports the selected base year and the following year in the same ICS file', async () => {
    seedTasksForCalendar([
      { title: '12월 마무리', start_date: '2026-12-28' },
      { title: '다음해 2월 결과보고', start_date: '2027-02-10' },
      { title: '범위 밖 업무', start_date: '2028-01-10' },
    ]);
    const downloadCapture = installDownloadCapture();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /캘린더 내보내기\(ICS\)/i }));
    const unfolded = unfoldIcs(await downloadCapture.getText());

    expect(unfolded).toContain('SUMMARY:12월 마무리');
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20261228');
    expect(unfolded).toContain('SUMMARY:다음해 2월 결과보고');
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20270210');
    expect(unfolded).not.toContain('SUMMARY:범위 밖 업무');
  });

  it('keeps January 1 tasks and folds long ICS lines for calendar compatibility', async () => {
    const longMemo = '학사 일정과 담당자 확인 메모가 길어져도 캘린더 가져오기에서 깨지지 않도록 접어서 내보냅니다.'.repeat(4);
    storage.set(SNAPSHOT_KEY, JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-06-30T00:00:00.000Z',
      tasks: [{
        id: 'jan-1-task',
        title: '새해 업무 시작 점검 안내',
        description: null,
        start_date: '2026-01-01',
        end_date: null,
        category: '계획',
        group_name: '새학년',
        group_color: '#7c3aed',
        priority: 'normal',
        source_doc: '업무지원과-0001',
        owner: '담당자 확인',
        reference_location: 'K-에듀파인 또는 공문함',
        successor_memo: longMemo,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }],
      memos: [],
    }));
    const downloadCapture = installDownloadCapture();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /캘린더 내보내기\(ICS\)/i }));
    const ics = await downloadCapture.getText();
    const unfolded = unfoldIcs(ics);

    expect(unfolded).toContain('DTSTART;VALUE=DATE:20260101');
    expect(unfolded).toContain('DTEND;VALUE=DATE:20260102');
    expect(unfolded).toContain('SUMMARY:새해 업무 시작 점검 안내');
    expect(unfolded).toContain('\\nPlus\/Minus 메모:');
    expect(ics).toContain('\r\n ');
  });

  it('places document titles directly on annual calendar days and moves them by drag and drop', async () => {
    render(<App />);
    await uploadSamplePdfToBoard();


    showMonth(5);
    const may = screen.getByRole('region', { name: /2026년 5월 연간 캘린더/i });
    const may11 = within(may).getByRole('button', { name: /2026-05-11 날짜칸 1건/i });
    expect(within(may11).getByText(/2026\. 학교 안…/i)).toBeInTheDocument();
    expect(screen.queryByText(/주요 업무/i)).not.toBeInTheDocument();

    const annualTask = within(may11).getByRole('button', { name: /2026\. 학교 안전 점검 계획 안내 연간 업무 이동/i });
    fireEvent.click(annualTask);
    expect(screen.getByText(/선택 날짜 상세/i)).toBeInTheDocument();

    fireEvent.dragStart(annualTask);
    fireEvent.drop(within(may).getByRole('button', { name: /2026-05-12 날짜칸 0건/i }));

    const may12 = within(may).getByRole('button', { name: /2026-05-12 날짜칸 1건/i });
    expect(within(may12).getAllByText(/2026\. 학교 안…/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/2026-05-12로 이동됨/i)).toBeInTheDocument();
  });

  it('shows year calendar day details when a heatmap day is clicked', async () => {
    render(<App />);
    await uploadSamplePdfToBoard();
    showMonth(5);

    fireEvent.click(await screen.findByRole('button', { name: /2026-05-11 날짜칸 1건/i }));

    expect(screen.getByText(/선택 날짜 상세/i)).toBeInTheDocument();
    const may = screen.getByRole('region', { name: /2026년 5월 연간 캘린더/i });
    expect(may).toHaveClass('min-w-0');
    expect(may).not.toHaveClass('w-[960px]');
    expect(screen.getByRole('grid', { name: /2026년 5월 날짜표/i })).toHaveClass('grid-cols-7');
    expect(screen.getByRole('button', { name: /2026-05-11 날짜칸 1건/i })).toHaveClass('min-h-20');
    expect(screen.getAllByText(/2026-05-11/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2026\. 학교 안…/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /월간 캘린더에서 보기/i })).not.toBeInTheDocument();
  });

  it('removes CSV export from the export screen', async () => {
    render(<App />);
    await uploadSamplePdfToBoard();
    const downloadCapture = installDownloadCapture();

    fireEvent.click(screen.getByRole('button', { name: /^내보내기$/i }));

    expect(screen.queryByRole('button', { name: /CSV 다운로드/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/CSV/i)).not.toBeInTheDocument();
    expect(screen.getByText(/업무묶음마다 Plus \/ Minus/i)).toBeInTheDocument();
    expect(screen.queryByText(/간트차트/i)).not.toBeInTheDocument();
    expect(downloadCapture.click).not.toHaveBeenCalled();
  });

  it('filters and sorts the task list by search text, missing metadata, and date order', () => {
    seedTasksForCalendar([
      { title: '나중 업무', start_date: '2026-09-10', source_doc: 'DOC-200', owner: '김담당', group_name: '안전교육', group_color: '#dc2626' },
      { title: '결과보고 후보 업무', start_date: '2026-03-01', source_doc: null, owner: '박담당', group_name: '계기교육', group_color: '#2563eb' },
      { title: '담당 미정 업무', start_date: '2026-05-01', source_doc: 'DOC-100', owner: null, group_name: '생활지도', group_color: '#059669' },
    ]);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^업무목록$/i }));

    fireEvent.change(screen.getByLabelText(/업무목록 검색/i), { target: { value: 'DOC-200' } });
    expect(screen.getByRole('row', { name: /나중 업무/i })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /결과보고 후보 업무/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/업무목록 검색/i), { target: { value: '계기교육' } });
    expect(screen.getByRole('row', { name: /결과보고 후보 업무/i })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /나중 업무/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/업무목록 검색/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/업무목록 필터/i), { target: { value: 'doc-missing' } });
    expect(screen.getByRole('row', { name: /결과보고 후보 업무/i })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /담당 미정 업무/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/업무목록 필터/i), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText(/업무목록 정렬/i), { target: { value: 'date-desc' } });
    const rows = screen.getAllByRole('row').filter((row) => /나중 업무|담당 미정 업무|결과보고 후보 업무/.test(row.textContent ?? ''));
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('나중 업무'),
      expect.stringContaining('담당 미정 업무'),
      expect.stringContaining('결과보고 후보 업무'),
    ]);
  });

  it('shows an export output preview before downloads and names omitted source content', () => {
    seedTasksForCalendar([
      { title: '계획 업무', start_date: '2026-03-10', source_doc: 'DOC-001', owner: '담당자', group_name: '교육과정', successor_memo: 'Plus: 빨리 준비함' },
      { title: '결과 업무', start_date: '2026-04-20', source_doc: 'DOC-002', owner: '담당자', group_name: '교육과정', successor_memo: 'Minus: 마감 주의' },
      { title: '안전 업무', start_date: '2026-05-01', source_doc: null, owner: '담당자', group_name: '안전교육' },
    ]);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^내보내기$/i }));

    const preview = screen.getByRole('region', { name: /DOCX\/Markdown 출력 미리보기/i });
    expect(within(preview).getByText(/업무묶음 2개 · 업무 3건/i)).toBeInTheDocument();
    expect(within(preview).getByText(/교육과정/i)).toBeInTheDocument();
    expect(within(preview).getByText(/2026-03-10 ~ 2026-04-20/i)).toBeInTheDocument();
    expect(within(preview).getByText(/2건/i)).toBeInTheDocument();
    expect(within(preview).getByText(/Plus 있음 · Minus 있음/i)).toBeInTheDocument();
    expect(within(preview).getByText(/원본 PDF, 추출 원문, 참고자료 위치는 포함하지 않습니다/i)).toBeInTheDocument();
  });

  it('toggles a presentation readability mode from the app shell', () => {
    render(<App />);

    const root = screen.getByTestId('app-shell');
    expect(root).not.toHaveClass('presentation-mode');
    fireEvent.click(screen.getByRole('button', { name: /발표 보기/i }));
    expect(root).toHaveClass('presentation-mode');
    expect(screen.getByRole('button', { name: /일반 보기/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /일반 보기/i }));
    expect(root).not.toHaveClass('presentation-mode');
  });

  it('keeps GitHub CI wired to Python and frontend verification commands', () => {
    const workflow = readSource('../../.github/workflows/ci.yml');
    expect(workflow).toContain('python3 -m pytest -q');
    expect(workflow).toContain('python3 -m compileall');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm test -- --run');
    expect(workflow).toContain('npm run build');
  });

  it('shows a mobile bottom tab bar that uses the same three navigation targets', () => {
    render(<App />);

    const mobileNav = screen.getByRole('navigation', { name: /모바일 주요 화면/i });
    expect(mobileNav).toHaveClass('md:hidden');
    expect(within(mobileNav).getByRole('button', { name: /모바일 캘린더 탭/i })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(within(mobileNav).getByRole('button', { name: /모바일 업무목록 탭/i }));
    expect(screen.getByRole('heading', { name: /^업무목록$/i })).toBeInTheDocument();
    expect(within(mobileNav).getByRole('button', { name: /모바일 업무목록 탭/i })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(within(mobileNav).getByRole('button', { name: /모바일 내보내기 탭/i }));
    expect(screen.getByRole('heading', { name: /^내보내기$/i })).toBeInTheDocument();
    expect(within(mobileNav).getByRole('button', { name: /모바일 내보내기 탭/i })).toHaveAttribute('aria-current', 'page');
  });

  it('lets teachers edit bundle-level Plus and Minus fields without per-document edit buttons', () => {
    seedTasksForCalendar([{
      id: 'memo-task',
      title: '업무 메모 테스트',
      group_name: '업무메모',
      successor_memo: 'Plus: 기존 장점\nMinus: 기존 아쉬움',
    }]);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^업무목록$/i }));
    const row = screen.getByRole('row', { name: /업무 메모 테스트/i });
    expect(within(row).queryByRole('button', { name: /^수정$/i })).not.toBeInTheDocument();

    const plusMemo = screen.getByLabelText(/업무메모 Plus 메모/i);
    const minusMemo = screen.getByLabelText(/업무메모 Minus 메모/i);
    expect(plusMemo).toHaveValue('기존 장점');
    expect(minusMemo).toHaveValue('기존 아쉬움');

    const saveButton = screen.getByRole('button', { name: /업무메모 Plus\/Minus 저장/i });
    fireEvent.change(plusMemo, { target: { value: '일찍 시작하면 편함' } });
    fireEvent.change(minusMemo, { target: { value: '예산 확인 필요' } });
    expect(screen.getByText(/저장 전 변경사항 있음/i)).toBeInTheDocument();
    fireEvent.click(saveButton);

    const storedMemos = JSON.parse(storage.get(BUNDLE_PMI_KEY) ?? '[]');
    expect(storedMemos).toEqual([
      expect.objectContaining({ group_name: '업무메모', pmi_plus: '일찍 시작하면 편함', pmi_minus: '예산 확인 필요' }),
    ]);
  });

  it('offers format-specific guidance when a selected upload is not a PDF', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/PDF 공문 파일 선택/i), {
      target: { files: [new File(['plain text'], '메모.txt', { type: 'text/plain' })] },
    });

    expect(await screen.findByText(/원본 PDF를 선택하거나 PDF로 다시 저장한 뒤 다시 선택해 주세요/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /직접 입력하기/i })).toBeInTheDocument();
  });

  it('offers scan-specific guidance when PDF text cannot be extracted', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ messages: ['스캔 PDF이거나 텍스트가 없는 PDF일 수 있습니다'] }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);

    fireEvent.change(screen.getByLabelText(/PDF 공문 파일 선택/i), {
      target: { files: [new File(['%PDF-1.4'], '스캔공문.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText(/직접 입력하기를 사용하거나 글자를 선택할 수 있는 PDF를 올려 주세요/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /직접 입력하기/i })).toBeInTheDocument();
  });

  it('offers a direct manual entry fallback when PDF extraction fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ messages: ['PDF에서 날짜를 찾지 못했습니다'] }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);

    fireEvent.change(screen.getByLabelText(/PDF 공문 파일 선택/i), {
      target: { files: [new File(['%PDF-1.4'], '실패공문.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText(/PDF에서 날짜를 찾지 못했습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /직접 입력하기/i }));

    expect(screen.getByRole('heading', { name: /추출 결과 미리보기/i })).toBeInTheDocument();
    expect(screen.getAllByText(/PDF 추출이 어려운 경우 필요한 항목만 직접 입력/i).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/1번 후보 업무명/i), { target: { value: '직접 입력 안전점검' } });
    fireEvent.change(screen.getByLabelText(/1번 후보 기안일/i), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText(/1번 후보 문서번호/i), { target: { value: '직접-0001' } });
    fireEvent.change(screen.getByLabelText(/1번 후보 담당/i), { target: { value: '담당자 확인' } });
    fireEvent.click(screen.getByRole('button', { name: /1건 자동 분류 제안 보기/i }));
    await confirmClassifyReview({ renameFirstBucketTo: '안전점검', confirmLabel: /1건 일괄 확인/i });

    await waitFor(() => expect(screen.queryByText(/추출 결과 미리보기/i)).not.toBeInTheDocument());
    const storedTasks = JSON.parse(storage.get(TASKS_KEY) ?? '[]');
    expect(storedTasks[0]).toEqual(expect.objectContaining({
      title: '직접 입력 안전점검',
      start_date: '2026-03-01',
      source_doc: '직접-0001',
      group_name: '안전점검',
    }));
  });

});
