import {
  DEFAULT_TASK_GROUP_COLOR,
  DEFAULT_TASK_GROUP_NAME,
  normalizeTaskGroupColor,
  normalizeTaskGroupName,
} from './taskGroups';
import { normalizeStoredRules } from './classify/ruleMemory';
import type { LearnedRule } from './classify/ruleMemory';
import { parsePmiMemo, serializePmiMemo } from './lib/format';

export type Priority = 'critical' | 'high' | 'normal' | 'low';
export type MemoColor = 'yellow' | 'pink' | 'blue' | 'green';

export type Task = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly start_date: string;
  readonly end_date: string | null;
  readonly category: string | null;
  readonly job_name?: string | null;
  readonly project_name?: string | null;
  readonly group_name: string;
  readonly group_color: string;
  readonly priority: Priority;
  readonly source_doc: string | null;
  readonly owner?: string | null;
  readonly document_type?: 'draft' | 'received' | string | null;
  readonly sender_org?: string | null;
  readonly reference_location?: string | null;
  readonly successor_memo: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type Memo = {
  readonly id: string;
  readonly task_id: string | null;
  readonly content: string;
  readonly color: MemoColor;
  readonly created_at: string;
  readonly updated_at: string;
};

export type BundlePmiMemo = {
  readonly group_name: string;
  readonly pmi_plus: string;
  readonly pmi_minus: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export type LocalDataSnapshot = {
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly tasks: Task[];
  readonly memos: Memo[];
  readonly bundlePmiMemos: BundlePmiMemo[];
  /** 자동 분류 학습 규칙(키워드→그룹). 인계자→인수자 백업 전달 시 함께 넘어간다. */
  readonly learnedRules: LearnedRule[];
};

export type BackupImportResult =
  | { readonly ok: true; readonly snapshot: LocalDataSnapshot }
  | { readonly ok: false; readonly message: string };

export const TASKS_KEY = 'handover:tasks:v2';
export const MEMOS_KEY = 'handover:memos:v2';
export const BUNDLE_PMI_MEMOS_KEY = 'handover:bundle-pmi-memos:v1';
export const LOCAL_SNAPSHOT_KEY = 'handover:local-snapshot:v1';
export const LOCAL_SNAPSHOT_SCHEMA_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function priorityOrNormal(value: unknown): Priority {
  if (value === 'critical' || value === 'high' || value === 'normal' || value === 'low') return value;
  return 'normal';
}

function memoColorOrYellow(value: unknown): MemoColor {
  if (value === 'pink' || value === 'blue' || value === 'green' || value === 'yellow') return value;
  return 'yellow';
}

function normalizedGroup(record: Record<string, unknown>): { readonly name: string; readonly color: string } {
  const name = normalizeTaskGroupName(record.group_name ?? record.groupName ?? DEFAULT_TASK_GROUP_NAME);
  const color = normalizeTaskGroupColor(record.group_color ?? record.groupColor ?? DEFAULT_TASK_GROUP_COLOR);
  return { name, color };
}

export function normalizeStoredTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const title = stringOrNull(item.title);
    const startDate = stringOrNull(item.start_date);
    const id = stringOrNull(item.id);
    if (!title || !startDate || !id) return [];
    const createdAt = stringOrNull(item.created_at) ?? startDate;
    const updatedAt = stringOrNull(item.updated_at) ?? createdAt;
    const group = normalizedGroup(item);
    return [{
      id,
      title,
      description: stringOrNull(item.description),
      start_date: startDate,
      end_date: stringOrNull(item.end_date),
      category: stringOrNull(item.category),
      job_name: stringOrNull(item.job_name),
      project_name: stringOrNull(item.project_name),
      group_name: group.name,
      group_color: group.color,
      priority: priorityOrNormal(item.priority),
      source_doc: stringOrNull(item.source_doc),
      owner: stringOrNull(item.owner),
      document_type: stringOrNull(item.document_type) ?? 'draft',
      sender_org: stringOrNull(item.sender_org),
      reference_location: stringOrNull(item.reference_location),
      successor_memo: stringOrNull(item.successor_memo),
      created_at: createdAt,
      updated_at: updatedAt,
    }];
  });
}

export function normalizeStoredMemos(value: unknown): Memo[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = stringOrNull(item.id);
    const content = stringOrNull(item.content);
    if (!id || !content) return [];
    const createdAt = stringOrNull(item.created_at) ?? new Date(0).toISOString();
    const updatedAt = stringOrNull(item.updated_at) ?? createdAt;
    return [{
      id,
      task_id: stringOrNull(item.task_id),
      content,
      color: memoColorOrYellow(item.color),
      created_at: createdAt,
      updated_at: updatedAt,
    }];
  });
}

function uniqueJoined(values: string[]): string {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join('\n');
}

export function normalizeStoredBundlePmiMemos(value: unknown, legacyTasks: Task[] = []): BundlePmiMemo[] {
  const nowText = new Date(0).toISOString();
  if (Array.isArray(value)) {
    const byGroup = new Map<string, BundlePmiMemo>();
    for (const item of value) {
      if (!isRecord(item)) continue;
      const groupName = normalizeTaskGroupName(item.group_name ?? item.groupName);
      const pmiPlus = stringOrNull(item.pmi_plus) ?? '';
      const pmiMinus = stringOrNull(item.pmi_minus) ?? '';
      if (!pmiPlus.trim() && !pmiMinus.trim()) continue;
      const createdAt = stringOrNull(item.created_at) ?? nowText;
      const updatedAt = stringOrNull(item.updated_at) ?? createdAt;
      const nextMemo = { group_name: groupName, pmi_plus: pmiPlus, pmi_minus: pmiMinus, created_at: createdAt, updated_at: updatedAt };
      const current = byGroup.get(groupName);
      if (!current || updatedAt >= current.updated_at) byGroup.set(groupName, nextMemo);
    }
    return Array.from(byGroup.values());
  }

  const byGroup = new Map<string, { plus: string[]; minus: string[]; createdAt: string; updatedAt: string }>();
  for (const task of legacyTasks) {
    const memo = parsePmiMemo(task.successor_memo);
    if (!memo.pmi_plus.trim() && !memo.pmi_minus.trim()) continue;
    const groupName = normalizeTaskGroupName(task.group_name);
    const current = byGroup.get(groupName) ?? { plus: [], minus: [], createdAt: task.created_at, updatedAt: task.updated_at };
    if (memo.pmi_plus.trim()) current.plus.push(memo.pmi_plus);
    if (memo.pmi_minus.trim()) current.minus.push(memo.pmi_minus);
    current.updatedAt = task.updated_at > current.updatedAt ? task.updated_at : current.updatedAt;
    byGroup.set(groupName, current);
  }

  return Array.from(byGroup.entries()).map(([groupName, memo]) => ({
    group_name: groupName,
    pmi_plus: uniqueJoined(memo.plus),
    pmi_minus: uniqueJoined(memo.minus),
    created_at: memo.createdAt,
    updated_at: memo.updatedAt,
  }));
}

export function createLocalDataSnapshot(
  tasks: Task[],
  memos: Memo[],
  bundlePmiMemosOrExportedAt: BundlePmiMemo[] | string = [],
  exportedAt = new Date().toISOString(),
  learnedRules: LearnedRule[] = [],
): LocalDataSnapshot {
  const normalizedTasks = normalizeStoredTasks(tasks);
  const bundlePmiMemos = typeof bundlePmiMemosOrExportedAt === 'string'
    ? normalizeStoredBundlePmiMemos(undefined, normalizedTasks)
    : normalizeStoredBundlePmiMemos(bundlePmiMemosOrExportedAt, normalizedTasks);
  return {
    schemaVersion: LOCAL_SNAPSHOT_SCHEMA_VERSION,
    exportedAt: typeof bundlePmiMemosOrExportedAt === 'string' ? bundlePmiMemosOrExportedAt : exportedAt,
    tasks: normalizedTasks,
    memos: normalizeStoredMemos(memos),
    bundlePmiMemos,
    learnedRules: normalizeStoredRules(learnedRules),
  };
}

function readStorageJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed;
  } catch (_error) {
    return null;
  }
}

function writeStorageJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export type PersistResult = {
  readonly snapshot: LocalDataSnapshot;
  /** localStorage 저장이 실제로 성공했는지. 실패(용량초과 등) 시 false. */
  readonly persisted: boolean;
};

function snapshotFromUnknown(value: unknown): LocalDataSnapshot | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== LOCAL_SNAPSHOT_SCHEMA_VERSION) return null;
  if (!Array.isArray(value.tasks) || !Array.isArray(value.memos)) return null;
  const tasks = normalizeStoredTasks(value.tasks);
  return createLocalDataSnapshot(
    tasks,
    normalizeStoredMemos(value.memos),
    normalizeStoredBundlePmiMemos(value.bundlePmiMemos, tasks),
    stringOrNull(value.exportedAt) ?? new Date().toISOString(),
    normalizeStoredRules(value.learnedRules),
  );
}

export function readLocalDataFromStorage(): LocalDataSnapshot {
  const storedSnapshot = snapshotFromUnknown(readStorageJson(LOCAL_SNAPSHOT_KEY));
  if (storedSnapshot) {
    writeLocalDataToStorage(storedSnapshot.tasks, storedSnapshot.memos, storedSnapshot.bundlePmiMemos, storedSnapshot.exportedAt);
    return storedSnapshot;
  }

  const legacyTasks = normalizeStoredTasks(readStorageJson(TASKS_KEY));
  const legacyMemos = normalizeStoredMemos(readStorageJson(MEMOS_KEY));
  const legacyBundleMemos = normalizeStoredBundlePmiMemos(readStorageJson(BUNDLE_PMI_MEMOS_KEY), legacyTasks);
  const snapshot = createLocalDataSnapshot(legacyTasks, legacyMemos, legacyBundleMemos);
  writeLocalDataToStorage(snapshot.tasks, snapshot.memos, snapshot.bundlePmiMemos, snapshot.exportedAt);
  return snapshot;
}

/**
 * 스냅샷을 localStorage에 저장하되, 용량초과 등으로 실패해도 예외를 던지지 않고
 * `persisted: false`로 알린다. 인메모리 상태는 호출부가 유지하므로 세션은 이어진다.
 */
export function persistLocalData(tasks: Task[], memos: Memo[], bundlePmiMemosOrExportedAt: BundlePmiMemo[] | string = [], exportedAt = new Date().toISOString()): PersistResult {
  const snapshot = createLocalDataSnapshot(tasks, memos, bundlePmiMemosOrExportedAt, exportedAt);
  try {
    writeStorageJson(LOCAL_SNAPSHOT_KEY, snapshot);
    writeStorageJson(TASKS_KEY, snapshot.tasks);
    writeStorageJson(MEMOS_KEY, snapshot.memos);
    writeStorageJson(BUNDLE_PMI_MEMOS_KEY, snapshot.bundlePmiMemos);
    return { snapshot, persisted: true };
  } catch (_error) {
    // 저장 실패(QuotaExceededError, 사생활 보호 모드 등). 데이터를 잃지 않도록
    // 예외는 삼키고 호출부가 사용자에게 안내하도록 신호만 돌려준다.
    return { snapshot, persisted: false };
  }
}

export function writeLocalDataToStorage(tasks: Task[], memos: Memo[], bundlePmiMemosOrExportedAt: BundlePmiMemo[] | string = [], exportedAt = new Date().toISOString()): LocalDataSnapshot {
  return persistLocalData(tasks, memos, bundlePmiMemosOrExportedAt, exportedAt).snapshot;
}

export function parseLocalBackupText(text: string): BackupImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    return { ok: false, message: '백업 파일을 읽을 수 없습니다. JSON 형식을 점검해 주세요.' };
  }

  if (!isRecord(parsed)) return { ok: false, message: '지원하는 백업 파일이 아닙니다. schemaVersion을 점검해 주세요.' };
  if (parsed.schemaVersion !== LOCAL_SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, message: `지원하지 않는 schemaVersion입니다. 현재 버전은 ${LOCAL_SNAPSHOT_SCHEMA_VERSION}입니다.` };
  }
  if (!Array.isArray(parsed.tasks)) return { ok: false, message: '백업 파일에 tasks 목록이 없습니다.' };
  if (!Array.isArray(parsed.memos)) return { ok: false, message: '백업 파일에 memos 목록이 없습니다.' };

  const tasks = normalizeStoredTasks(parsed.tasks);
  const memos = normalizeStoredMemos(parsed.memos);
  const bundlePmiMemos = normalizeStoredBundlePmiMemos(parsed.bundlePmiMemos, tasks);
  if (tasks.length !== parsed.tasks.length) return { ok: false, message: '백업 tasks 항목 중 필수 값이 빠진 항목이 있습니다.' };
  if (memos.length !== parsed.memos.length) return { ok: false, message: '백업 memos 항목 중 필수 값이 빠진 항목이 있습니다.' };

  return {
    ok: true,
    snapshot: createLocalDataSnapshot(
      tasks,
      memos,
      bundlePmiMemos,
      stringOrNull(parsed.exportedAt) ?? new Date().toISOString(),
      normalizeStoredRules(parsed.learnedRules),
    ),
  };
}

function taskMemos(task: Task, memos: Memo[]): Memo[] {
  return memos.filter((memo) => memo.task_id === task.id);
}

export function buildSuccessorHandoffMarkdown(tasks: Task[], memos: Memo[], bundlePmiMemosOrExportedAt: BundlePmiMemo[] | string = [], exportedAt = new Date().toISOString()): string {
  const bundlePmiMemos = typeof bundlePmiMemosOrExportedAt === 'string' ? normalizeStoredBundlePmiMemos(undefined, tasks) : normalizeStoredBundlePmiMemos(bundlePmiMemosOrExportedAt, tasks);
  const exportDate = typeof bundlePmiMemosOrExportedAt === 'string' ? bundlePmiMemosOrExportedAt : exportedAt;
  type HandoffGroup = {
    readonly name: string;
    readonly jobName: string | null;
    readonly tasks: Task[];
  };

  const uncategorizedGroupName = '미분류';
  const groupMap = new Map<string, Task[]>();
  for (const task of tasks) {
    const groupName = task.group_name.trim() || uncategorizedGroupName;
    groupMap.set(groupName, [...(groupMap.get(groupName) ?? []), task]);
  }

  const handoffGroups: HandoffGroup[] = Array.from(groupMap.entries())
    .map(([name, groupedTasks]) => ({
      name,
      jobName: groupedTasks.find((task) => task.job_name?.trim())?.job_name?.trim() ?? null,
      tasks: groupedTasks.slice().sort((a, b) => a.start_date.localeCompare(b.start_date) || a.title.localeCompare(b.title, 'ko')),
    }))
    .sort((a, b) => {
      if (a.name === uncategorizedGroupName) return 1;
      if (b.name === uncategorizedGroupName) return -1;
      const dateCompare = a.tasks[0].start_date.localeCompare(b.tasks[0].start_date);
      return dateCompare || a.name.localeCompare(b.name, 'ko');
    });

  const lines = [
    '# 업무묶음 Plus/Minus 정리',
    '',
    `생성일: ${exportDate.slice(0, 10)}`,
    '',
    '현재 로컬 업무 카드에서 만든 참고자료입니다. 원본 PDF 파일이나 원문 추출 텍스트는 포함하지 않습니다.',
    '',
  ];

  if (tasks.length === 0) {
    lines.push('- [입력 예정] 업무묶음이 없습니다.');
    return `${lines.join('\n')}\n`;
  }

  const jobBuckets = new Map<string, string[]>();
  for (const group of handoffGroups) {
    const jobKey = group.jobName ?? '업무 미지정';
    jobBuckets.set(jobKey, [...(jobBuckets.get(jobKey) ?? []), group.name]);
  }
  const jobEntries = Array.from(jobBuckets.entries()).sort((a, b) => {
    if (a[0] === '업무 미지정') return 1;
    if (b[0] === '업무 미지정') return -1;
    return a[0].localeCompare(b[0], 'ko');
  });
  lines.push('## 업무 구조', '');
  for (const [jobName, groupNames] of jobEntries) {
    lines.push(`- ${jobName}: ${groupNames.join(', ')}`);
  }
  lines.push('');

  for (const group of handoffGroups) {
    const firstDate = group.tasks[0].start_date;
    const lastDate = group.tasks[group.tasks.length - 1].start_date;
    const period = firstDate === lastDate ? firstDate : `${firstDate} ~ ${lastDate}`;
    const completedCount = group.tasks.filter((task) => task.category === '결과보고').length;
    const inProgressCount = group.tasks.length - completedCount;
    lines.push(
      `## ${group.name} Plus/Minus 메모`,
      '',
      ...(group.jobName ? [`- 소속 업무: ${group.jobName}`] : []),
      `- 기간: ${period}`,
      `- 진행 요약: 완료 ${completedCount}건 / 진행 ${inProgressCount}건`,
      '',
      '체크리스트',
      ...group.tasks.map((task) => `- [${task.category === '결과보고' ? 'x' : ' '}] ${task.title} · ${task.start_date} · ${task.category || '업무'}`),
      '',
      '문서번호·기안일',
      ...group.tasks.map((task) => `- 문서번호·기안일: ${task.source_doc || '–'} / ${task.start_date || '일정 미정'}`),
    );

    const bundleMemo = bundlePmiMemos.find((memo) => normalizeTaskGroupName(memo.group_name) === normalizeTaskGroupName(group.name));
    const bundleMemoText = bundleMemo ? serializePmiMemo(bundleMemo) : null;
    const notes = bundleMemoText ? [bundleMemoText] : group.tasks.flatMap((task) => [
      task.successor_memo?.trim() ?? '',
      ...taskMemos(task, memos).map((memo) => memo.content.trim()),
    ]).filter(Boolean);
    if (notes.length > 0) {
      lines.push('', 'Plus/Minus 메모', ...notes.map((memo) => `- ${memo}`));
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}
