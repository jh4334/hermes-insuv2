import { describe, expect, it } from 'vitest';
import {
  LOCAL_SNAPSHOT_SCHEMA_VERSION,
  buildSuccessorHandoffMarkdown,
  createLocalDataSnapshot,
  normalizeStoredBundlePmiMemos,
  normalizeStoredTasks,
  parseLocalBackupText,
} from './taskStorage';
import type { BundlePmiMemo, Memo, Task } from './taskStorage';

const sampleTask = {
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
  successor_memo: '작년 체크리스트를 먼저 확인',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
} satisfies Task;

const sampleMemo: Memo = {
  id: 'memo-1',
  task_id: 'task-1',
  content: '포스트잇형 참고 메모',
  color: 'yellow',
  created_at: '2026-01-02T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
};

describe('local task storage snapshot', () => {
  it('normalizes explicit named group fields without losing metadata, dates, or successor memo fields', () => {
    const tasks = normalizeStoredTasks([
      {
        ...sampleTask,
        group_name: '  안전  ',
        group_color: '#DC2626',
      },
    ]);

    expect(tasks).toEqual([
      expect.objectContaining({
        id: 'task-1',
        start_date: '2026-05-11',
        end_date: null,
        source_doc: '업무지원과-0000',
        owner: '담당자 확인',
        reference_location: 'K-에듀파인 또는 공문함',
        successor_memo: '작년 체크리스트를 먼저 확인',
        group_name: '안전',
        group_color: '#dc2626',
      }),
    ]);
  });

  it('normalizes legacy tasks without creating legacy metadata state', () => {
    const tasks = normalizeStoredTasks([sampleTask]);

    expect(tasks[0]).toEqual(expect.objectContaining({
      owner: '담당자 확인',
    }));
  });

  it('creates a versioned backup snapshot that excludes raw PDF and extraction text fields', () => {
    const snapshot = createLocalDataSnapshot([sampleTask], [sampleMemo], [{ group_name: '안전', pmi_plus: '좋았던 점', pmi_minus: '주의점', created_at: '2026-01-03T00:00:00.000Z', updated_at: '2026-01-03T00:00:00.000Z' }], '2026-06-30T00:00:00.000Z');
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.schemaVersion).toBe(LOCAL_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.memos).toHaveLength(1);
    expect(snapshot.bundlePmiMemos).toEqual([expect.objectContaining({ group_name: '안전', pmi_plus: '좋았던 점', pmi_minus: '주의점' })]);
    expect(serialized).not.toContain('documentLines');
    expect(serialized).not.toContain('rawText');
    expect(serialized).not.toContain('pdfBytes');
    expect(serialized).not.toContain('%PDF');
  });

  it('derives one bundle-level Plus/Minus memo from legacy task successor memos', () => {
    const bundleMemos = normalizeStoredBundlePmiMemos(undefined, [
      sampleTask,
      { ...sampleTask, id: 'task-2', title: '결과보고', successor_memo: 'Plus: 작년 자료 재사용\nMinus: 품의 촉박' },
      { ...sampleTask, id: 'task-3', group_name: '생활지도', successor_memo: '그냥 적은 옛 메모' },
    ]);

    expect(bundleMemos).toEqual([
      expect.objectContaining({ group_name: '안전', pmi_plus: expect.stringContaining('작년 체크리스트를 먼저 확인'), pmi_minus: '품의 촉박' }),
      expect.objectContaining({ group_name: '생활지도', pmi_plus: '그냥 적은 옛 메모', pmi_minus: '' }),
    ]);
  });

  it('deduplicates bundle Plus/Minus memos by normalized group name using the newest update', () => {
    const duplicateMemos: BundlePmiMemo[] = [
      { group_name: ' 안전 ', pmi_plus: '기존 장점', pmi_minus: '기존 주의점', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' },
      { group_name: '안전', pmi_plus: '가져온 장점', pmi_minus: '가져온 주의점', created_at: '2026-02-01T00:00:00.000Z', updated_at: '2026-03-01T00:00:00.000Z' },
      { groupName: '생활지도', pmi_plus: '다른 꾸러미', pmi_minus: '', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' } as unknown as BundlePmiMemo,
    ];

    expect(normalizeStoredBundlePmiMemos(duplicateMemos)).toEqual([
      expect.objectContaining({ group_name: '안전', pmi_plus: '가져온 장점', pmi_minus: '가져온 주의점', updated_at: '2026-03-01T00:00:00.000Z' }),
      expect.objectContaining({ group_name: '생활지도', pmi_plus: '다른 꾸러미' }),
    ]);
  });

  it('parses valid backup text and reports useful schema errors', () => {
    const valid = parseLocalBackupText(JSON.stringify(createLocalDataSnapshot([sampleTask], [sampleMemo])));
    const invalid = parseLocalBackupText(JSON.stringify({ schemaVersion: 999, tasks: [], memos: [] }));

    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.snapshot.tasks[0]).toEqual(expect.objectContaining({ title: sampleTask.title }));
    }
    expect(invalid).toEqual({
      ok: false,
      message: expect.stringContaining('schemaVersion'),
    });
  });
});

describe('successor handoff markdown', () => {
  it('exports one compact post-it style handoff memo per task group', () => {
    const doneTask = {
      ...sampleTask,
      id: 'task-2',
      title: '학교 안전 점검 결과보고',
      start_date: '2026-06-01',
      category: '결과보고',
      priority: 'normal',
      successor_memo: null,
    } satisfies Task;
    const ungroupedTask = {
      ...sampleTask,
      id: 'task-3',
      title: '담당 미확정 업무',
      start_date: '2026-07-01',
      group_name: '',
      successor_memo: null,
    } satisfies Task;

    const markdown = buildSuccessorHandoffMarkdown([doneTask, ungroupedTask, sampleTask], [sampleMemo], [
      { group_name: '안전', pmi_plus: '꾸러미 전체 장점', pmi_minus: '꾸러미 전체 주의점', created_at: '2026-01-03T00:00:00.000Z', updated_at: '2026-01-03T00:00:00.000Z' },
    ], '2026-06-30T00:00:00.000Z');

    expect(markdown).toContain('# 업무묶음 Plus/Minus 정리');
    expect(markdown).toContain('원본 PDF 파일이나 원문 추출 텍스트는 포함하지 않습니다');
    expect(markdown.match(/^## /gm)).toHaveLength(3); // 업무 구조 개요 + 그룹 2개
    expect(markdown).toContain('## 안전 Plus/Minus 메모');
    expect(markdown).toContain('- 기간: 2026-05-11 ~ 2026-06-01');
    expect(markdown).toContain('- 진행 요약: 완료 1건 / 진행 1건');
    expect(markdown).toContain('- [ ] 학교 안전 점검 계획 안내 · 2026-05-11 · 계획');
    expect(markdown).toContain('- [x] 학교 안전 점검 결과보고 · 2026-06-01 · 결과보고');
    expect(markdown).toContain('- 문서번호·기안일: 업무지원과-0000 / 2026-05-11');
    expect(markdown).not.toContain('문서/자료 위치');
    expect(markdown).not.toContain('K-에듀파인 또는 공문함');
    expect(markdown).toContain('Plus: 꾸러미 전체 장점');
    expect(markdown).toContain('Minus: 꾸러미 전체 주의점');
    expect(markdown).not.toContain('- 포스트잇: 작년 체크리스트를 먼저 확인');
    expect(markdown).not.toContain('- 포스트잇: 포스트잇형 참고 메모');
    expect(markdown).toContain('## 미분류 Plus/Minus 메모');
    expect(markdown.indexOf('## 안전 Plus/Minus 메모')).toBeLessThan(markdown.indexOf('## 미분류 Plus/Minus 메모'));
    expect(markdown).not.toContain('## 학교 안전 점검 계획 안내');
    expect(markdown).not.toContain('문서번호 + 기안일');
  });

  it('keeps empty handoff export honest without creating fake group memos', () => {
    const markdown = buildSuccessorHandoffMarkdown([], [], '2026-06-30T00:00:00.000Z');

    expect(markdown).toContain('# 업무묶음 Plus/Minus 정리');
    expect(markdown).toContain('- [입력 예정] 업무묶음이 없습니다.');
    expect(markdown.match(/^## /gm)).toBeNull();
  });
});

describe('learned rules in local backup', () => {
  it('includes learned rules in the snapshot and restores them through parseLocalBackupText', () => {
    const rules = [{ keyword: '통일교육주간', group_name: '통일', job_name: '계기교육', hits: 2, updated_at: '2026-06-01T00:00:00.000Z' }];
    const snapshot = createLocalDataSnapshot([], [], [], '2026-06-30T00:00:00.000Z', rules);
    expect(snapshot.learnedRules).toEqual(rules);

    const parsed = parseLocalBackupText(JSON.stringify(snapshot));
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.snapshot.learnedRules).toEqual(rules);
  });

  it('defaults to an empty rule list for backups made before rules existed', () => {
    const legacy = createLocalDataSnapshot([], [], [], '2026-06-30T00:00:00.000Z');
    const { learnedRules: _dropped, ...withoutRules } = legacy;
    const parsed = parseLocalBackupText(JSON.stringify(withoutRules));
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.snapshot.learnedRules).toEqual([]);
  });
});

describe('job hierarchy in the handoff markdown', () => {
  it('adds an 업무 구조 overview and per-group 소속 업무 lines', () => {
    const unifiedTask: Task = {
      id: 'job-1',
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
      owner: null,
      successor_memo: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    const strayTask: Task = { ...unifiedTask, id: 'job-2', title: '독서 골든벨 운영', job_name: null, group_name: '독서교육', start_date: '2026-06-01' };

    const markdown = buildSuccessorHandoffMarkdown([unifiedTask, strayTask], [], '2026-06-30T00:00:00.000Z');

    expect(markdown).toContain('## 업무 구조');
    expect(markdown).toContain('- 계기교육: 통일');
    expect(markdown).toContain('- 업무 미지정: 독서교육');
    expect(markdown.indexOf('- 계기교육: 통일')).toBeLessThan(markdown.indexOf('- 업무 미지정: 독서교육'));
    expect(markdown).toContain('- 소속 업무: 계기교육');
  });
});
