import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { RULE_MEMORY_KEY } from './classify/ruleMemory';

const PERSONA_KEY = 'handover:persona:v1';
const SNAPSHOT_KEY = 'handover:local-snapshot:v1';

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

function seedStructureTasks(extraTasks: Array<Record<string, unknown>> = []) {
  storage.set(SNAPSHOT_KEY, JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-06-30T00:00:00.000Z',
    tasks: [
      ...extraTasks,
      {
        id: 'unified-1',
        title: '통일교육주간 운영 계획',
        description: null,
        start_date: '2026-05-11',
        end_date: null,
        category: '계획',
        job_name: '계기교육',
        group_name: '통일',
        group_color: '#2563eb',
        priority: 'normal',
        source_doc: 'DOC-1',
        owner: '교무부',
        reference_location: null,
        successor_memo: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'inbox-1',
        title: '통일교육 결과 자료 제출',
        description: null,
        start_date: '2026-06-01',
        end_date: null,
        category: null,
        job_name: null,
        group_name: '미분류',
        group_color: '#475569',
        priority: 'normal',
        source_doc: 'DOC-2',
        owner: '교무부',
        reference_location: null,
        successor_memo: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    memos: [],
    bundlePmiMemos: [],
  }));
}

describe('two-track persona onboarding', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  it('asks for a track on first launch and opens the giver default view (구조도)', async () => {
    render(<App />);

    const onboarding = screen.getByRole('dialog', { name: /시작 모드 선택/i });
    expect(within(onboarding).getByText(/내 업무 정리해 넘기기/i)).toBeInTheDocument();
    expect(within(onboarding).getByText(/받은·작년 자료 파악하기/i)).toBeInTheDocument();

    fireEvent.click(within(onboarding).getByRole('button', { name: /인계자 모드로 시작/i }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /시작 모드 선택/i })).not.toBeInTheDocument());
    expect(storage.get(PERSONA_KEY)).toBe('giver');
    expect(screen.getByRole('heading', { name: /업무 구조도/i })).toBeInTheDocument();
    expect(screen.getByText(/구조도 1장이 곧 인수인계서입니다/i)).toBeInTheDocument();
  });

  it('opens the receiver default view (캘린더) and keeps the toggle in the sidebar', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /인수자 모드로 시작/i }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /시작 모드 선택/i })).not.toBeInTheDocument());
    expect(storage.get(PERSONA_KEY)).toBe('receiver');
    expect(screen.getByRole('heading', { name: /연간 캘린더/i })).toBeInTheDocument();

    const toggle = screen.getByRole('group', { name: /인계자 인수자 모드 전환/i });
    fireEvent.click(within(toggle).getByRole('button', { name: /^인계자$/i }));
    expect(screen.getByRole('heading', { name: /업무 구조도/i })).toBeInTheDocument();
  });

  it('skips onboarding when a persona is already stored', () => {
    storage.set(PERSONA_KEY, 'receiver');
    render(<App />);
    expect(screen.queryByRole('dialog', { name: /시작 모드 선택/i })).not.toBeInTheDocument();
  });
});

describe('structure view integration', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    storage.clear();
    storage.set(PERSONA_KEY, 'giver');
    vi.restoreAllMocks();
  });

  it('moves an inbox card into a 세부업무 stage by drag and learns a rule from the correction', async () => {
    seedStructureTasks();
    render(<App />);

    expect(screen.getByRole('heading', { name: /업무 구조도/i })).toBeInTheDocument();
    fireEvent.dragStart(screen.getByRole('listitem', { name: /통일교육 결과 자료 제출 구조도 카드/i }));
    fireEvent.drop(screen.getByLabelText(/통일 결과보고 칸 0건/i));

    await waitFor(() => {
      const snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
      const moved = snapshot.tasks.find((task: { id: string }) => task.id === 'inbox-1');
      expect(moved.group_name).toBe('통일');
      expect(moved.category).toBe('결과보고');
      expect(moved.job_name).toBe('계기교육');
      expect(moved.group_color).toBe('#2563eb');
    });

    const rules = JSON.parse(storage.get(RULE_MEMORY_KEY) ?? '[]');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ group_name: '통일', job_name: '계기교육' }),
    ]));
  });

  it('shows the unclassified count badge on the 구조도 nav item and a calendar shortcut on the empty state', async () => {
    seedStructureTasks();
    render(<App />);
    expect(screen.getByLabelText(/미분류 1건/i)).toHaveTextContent('1');

    storage.clear();
    storage.set(PERSONA_KEY, 'giver');
    cleanup();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /캘린더에서 공문 업로드하러 가기/i }));
    expect(screen.getByRole('heading', { name: /연간 캘린더/i })).toBeInTheDocument();
  });

  it('merges into an existing 세부업무 on rename and adopts its color and 업무', async () => {
    seedStructureTasks([
      {
        id: 'stray-1',
        title: '통일 골든벨 운영',
        description: null,
        start_date: '2026-07-01',
        end_date: null,
        category: '계획',
        job_name: null,
        group_name: '통일행사',
        group_color: '#059669',
        priority: 'normal',
        source_doc: 'DOC-3',
        owner: '교무부',
        reference_location: null,
        successor_memo: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    render(<App />);

    fireEvent.click(screen.getByLabelText(/^통일행사 이름 수정$/i));
    const renameInput = screen.getByLabelText(/통일행사 세부업무 이름 수정/i);
    fireEvent.change(renameInput, { target: { value: '통일' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });

    await waitFor(() => {
      const snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
      const merged = snapshot.tasks.find((task: { id: string }) => task.id === 'stray-1');
      expect(merged.group_name).toBe('통일');
      expect(merged.group_color).toBe('#2563eb');
      expect(merged.job_name).toBe('계기교육');
    });
  });

  it('renames a 세부업무 and assigns an 업무 bucket from the structure view', async () => {
    seedStructureTasks();
    render(<App />);

    fireEvent.click(screen.getByLabelText(/통일 이름 수정/i));
    const renameInput = screen.getByLabelText(/통일 세부업무 이름 수정/i);
    fireEvent.change(renameInput, { target: { value: '통일교육' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });

    await waitFor(() => {
      const snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
      expect(snapshot.tasks.some((task: { group_name: string }) => task.group_name === '통일교육')).toBe(true);
    });

    const jobInput = screen.getByLabelText(/통일교육 상위 업무 배정/i);
    fireEvent.change(jobInput, { target: { value: '교육과정운영' } });
    fireEvent.blur(jobInput);

    await waitFor(() => {
      const snapshot = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
      const renamed = snapshot.tasks.find((task: { group_name: string }) => task.group_name === '통일교육');
      expect(renamed.job_name).toBe('교육과정운영');
    });
  });
});
