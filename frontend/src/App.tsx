import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import {
  CalendarDays,
  Download,
  Inbox,
  Maximize2,
  Network,
  Pencil,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { TaskGroupPill } from './TaskGroupControls';
import { buildGroupHandoffDocx } from './exportDocx';
import { loadKoreanPublicHolidays } from './holidayCalendar';
import {
  buildCalendarMonths,
  buildMonthGridDates,
  daysInMonth,
  holidayYearsForTasks,
  isInCalendarRange,
} from './lib/dates';
import {
  buildAnnualFlow,
  buildRangeIcs,
  groupColorStyle,
  normalizeWorkflowStage,
  serializePmiMemo,
  taskToEditDraft,
  textOrNull,
  truncateCalendarTitle,
} from './lib/format';
import { buildSampleDemoData } from './sampleDemoData';
import {
  UNCLASSIFIED_GROUP_NAME,
  learnAssignment,
  mergeLearnedRules,
  readRuleMemory,
  writeRuleMemory,
} from './classify/ruleMemory';
import { PERSONA_COPY, readPersonaMode, writePersonaMode } from './persona';
import type { PersonaMode } from './persona';
import { StructureBoard } from './components/StructureBoard';
import type { StructureCardPatch } from './components/StructureBoard';
import { DEFAULT_TASK_GROUP_COLOR, normalizeTaskGroupName, pickTaskGroupColor } from './taskGroups';
import {
  buildSuccessorHandoffMarkdown,
  createLocalDataSnapshot,
  normalizeStoredBundlePmiMemos,
  persistLocalData,
  readLocalDataFromStorage,
} from './taskStorage';
import type { BundlePmiMemo, LocalDataSnapshot, Memo, Task } from './taskStorage';
import { ExportScreen } from './components/ExportScreen';
import { IntakeBundleSection } from './components/IntakeBundleSection';
import { ArchiveScreen } from './components/ArchiveScreen';
import { TaskEditDialog } from './components/TaskEditDialog';
import { PresentationModeToggle } from './components/PresentationModeToggle';
import { buildBundleQuadrants } from './lib/quadrant';
import type { BundleQuadrant } from './lib/quadrant';
import type {
  BackupImportMode,
  BundleFlow,
  LastUndo,
  CalendarMonth,
  MonthFlow,
  NewTaskInput,
  TaskEditDraft,
  View,
} from './types';
const navItems: Array<{ id: View; label: string; icon: typeof CalendarDays }> = [
  { id: 'calendar', label: '캘린더', icon: CalendarDays },
  { id: 'structure', label: '구조도', icon: Network },
  { id: 'archive', label: '업무목록', icon: Inbox },
  { id: 'export', label: '내보내기', icon: Download },
];

function now() {
  return new Date().toISOString();
}

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function download(filename: string, text: string, type = 'text/plain;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type }));
}

function StagePill({ stage, compact = false }: { stage?: string | null; compact?: boolean }) {
  const normalized = normalizeWorkflowStage(stage);
  if (!normalized) return null;
  const tone = normalized === '계획' ? 'border-sky-200 bg-sky-50 text-sky-700' : normalized === '심의·협의' ? 'border-violet-200 bg-violet-50 text-violet-700' : normalized === '품의' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return (
    <span aria-label={`단계: ${normalized}`} className={`inline-flex shrink-0 items-center rounded-full border font-mono font-semibold ${tone} ${compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-[11px]'}`}>
      {normalized}
    </span>
  );
}

export function App() {
  const initialDataRef = useRef<LocalDataSnapshot | null>(null);
  if (initialDataRef.current === null) initialDataRef.current = readLocalDataFromStorage();
  const [personaMode, setPersonaMode] = useState<PersonaMode | null>(() => readPersonaMode());
  const [view, setView] = useState<View>(() => {
    const stored = readPersonaMode();
    return stored ? PERSONA_COPY[stored].defaultView : 'calendar';
  });
  const [archiveGroupFocus, setArchiveGroupFocus] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>(() => initialDataRef.current?.tasks ?? []);
  const [memos, setMemos] = useState<Memo[]>(() => initialDataRef.current?.memos ?? []);
  const [bundlePmiMemos, setBundlePmiMemos] = useState<BundlePmiMemo[]>(() => initialDataRef.current?.bundlePmiMemos ?? []);
  const [storageStatus, setStorageStatus] = useState('로컬 저장 준비됨');
  const [presentationMode, setPresentationMode] = useState(false);
  const [lastUndo, setLastUndo] = useState<LastUndo | null>(null);
  const [holidayDates, setHolidayDates] = useState<ReadonlySet<string>>(() => new Set());
  const holidayYears = useMemo(() => holidayYearsForTasks(tasks), [tasks]);

  useEffect(() => {
    let cancelled = false;
    if (holidayYears.length === 0) {
      setHolidayDates(new Set());
      return () => { cancelled = true; };
    }
    loadKoreanPublicHolidays(holidayYears)
      .then((calendar) => {
        if (cancelled) return;
        setHolidayDates(calendar.dates);
      })
      .catch(() => {
        if (cancelled) return;
        setHolidayDates(new Set());
      });
    return () => { cancelled = true; };
  }, [holidayYears]);

  function saveLocalData(nextTasks: Task[], nextMemos: Memo[], status: string, nextBundlePmiMemos = bundlePmiMemos) {
    const normalizedBundlePmiMemos = normalizeStoredBundlePmiMemos(nextBundlePmiMemos, nextTasks);
    const { persisted } = persistLocalData(nextTasks, nextMemos, normalizedBundlePmiMemos);
    // 저장이 실패해도(용량초과 등) 인메모리 상태는 갱신해 세션을 이어가되,
    // 새로고침 시 유실될 수 있음을 명확히 안내한다.
    setTasks(nextTasks);
    setMemos(nextMemos);
    setBundlePmiMemos(normalizedBundlePmiMemos);
    if (persisted) {
      setStorageStatus(status);
    } else {
      setStorageStatus('저장 공간이 부족해 이 기기에 저장하지 못했습니다');
      toast.error('저장 공간이 부족해 변경 사항을 저장하지 못했어요. 내보내기에서 백업을 내려받고 오래된 데이터를 정리해 주세요.', { duration: 8000 });
    }
  }

  function captureUndo(label: string) {
    setLastUndo({ label, tasks, memos, bundlePmiMemos });
  }

  useEffect(() => {
    if (!lastUndo) return undefined;
    const timeoutId = window.setTimeout(() => setLastUndo(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [lastUndo]);

  function restoreLastUndo() {
    if (!lastUndo) return;
    saveLocalData(lastUndo.tasks, lastUndo.memos, `${lastUndo.label} 되돌림`, lastUndo.bundlePmiMemos);
    setLastUndo(null);
    toast.success('마지막 작업을 되돌렸습니다');
  }

  function appendTasks(inputs: NewTaskInput[]) {
    captureUndo('업무 추가');
    const ts = now();
    const added = inputs.map((task) => ({ ...task, id: uid(), created_at: ts, updated_at: ts }));
    saveLocalData([...tasks, ...added], memos, '업무 카드가 로컬 스냅샷에 추가되었습니다');
    return added;
  }

  function loadSampleDemoData() {
    captureUndo('샘플 데이터 추가');
    const sample = buildSampleDemoData(new Date().getFullYear());
    const existingIds = new Set(tasks.map((task) => task.id));
    const sampleTasks = sample.tasks.map((task) => existingIds.has(task.id) ? { ...task, id: `${task.id}-${uid()}` } : task);
    saveLocalData([...tasks, ...sampleTasks], [...memos, ...sample.memos], '샘플 데이터가 로컬 보드에 추가되었습니다', bundlePmiMemos);
    toast.success('샘플 데이터가 로컬 보드에 추가되었습니다');
  }

  function clearAll() {
    captureUndo('전체 초기화');
    saveLocalData([], [], '로컬 데이터가 비워졌습니다', []);
    toast.success('로컬 데이터가 비워졌습니다');
  }

  function deleteTask(id: string) {
    captureUndo('업무 삭제');
    const next = tasks.filter((task) => task.id !== id);
    const nextMemos = memos.filter((memo) => memo.task_id !== id);
    saveLocalData(next, nextMemos, '업무 카드가 삭제되었습니다');
  }

  function updateTask(updatedTask: Task) {
    const next = tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
    saveLocalData(next, memos, '업무 카드가 수정되었습니다');
  }

  function deleteTaskGroup(groupName: string) {
    captureUndo('업무묶음 삭제');
    const normalized = normalizeTaskGroupName(groupName);
    const removedIds = new Set(tasks.filter((task) => normalizeTaskGroupName(task.group_name) === normalized).map((task) => task.id));
    const next = tasks.filter((task) => !removedIds.has(task.id));
    const nextMemos = memos.filter((memo) => !removedIds.has(memo.task_id ?? ''));
    const nextBundlePmiMemos = bundlePmiMemos.filter((memo) => normalizeTaskGroupName(memo.group_name) !== normalized);
    saveLocalData(next, nextMemos, `${normalized} 업무묶음이 삭제되었습니다`, nextBundlePmiMemos);
    toast.success(`${normalized} 업무묶음 삭제 완료`);
  }

  function moveTaskToDate(id: string, startDate: string) {
    captureUndo('일정 이동');
    const next = tasks.map((task) =>
      task.id === id ? { ...task, start_date: startDate, end_date: null, updated_at: now() } : task,
    );
    saveLocalData(next, memos, '일정 변경이 로컬 스냅샷에 저장되었습니다');
    toast.success(`${startDate}로 이동됨`);
  }

  function exportBackup() {
    const snapshot = createLocalDataSnapshot(tasks, memos, bundlePmiMemos, now(), readRuleMemory());
    download('modoo-insu-local-backup.json', JSON.stringify(snapshot, null, 2), 'application/json;charset=utf-8');
    setStorageStatus('로컬 백업 저장 완료');
    toast.success('로컬 백업 저장 완료');
  }

  function applyBackupSnapshot(snapshot: LocalDataSnapshot, mode: BackupImportMode) {
    captureUndo(mode === 'append' ? '백업 추가' : '백업 대체');
    if (snapshot.learnedRules.length > 0) {
      writeRuleMemory(mode === 'replace' ? snapshot.learnedRules : mergeLearnedRules(readRuleMemory(), snapshot.learnedRules));
    }
    if (mode === 'replace') {
      saveLocalData(snapshot.tasks, snapshot.memos, '백업 가져오기 완료', snapshot.bundlePmiMemos);
      toast.success('백업 가져오기 완료');
      return;
    }
    const existingIds = new Set(tasks.map((task) => task.id));
    const idMap = new Map<string, string>();
    const importedTasks = snapshot.tasks.map((task) => {
      const nextId = existingIds.has(task.id) ? `${task.id}-${uid()}` : task.id;
      existingIds.add(nextId);
      idMap.set(task.id, nextId);
      return { ...task, id: nextId, updated_at: now() };
    });
    const existingMemoIds = new Set(memos.map((memo) => memo.id));
    const importedMemos = snapshot.memos.map((memo) => {
      const nextId = existingMemoIds.has(memo.id) ? `${memo.id}-${uid()}` : memo.id;
      existingMemoIds.add(nextId);
      return {
        ...memo,
        id: nextId,
        task_id: memo.task_id ? (idMap.get(memo.task_id) ?? memo.task_id) : null,
        updated_at: now(),
      };
    });
    saveLocalData([...tasks, ...importedTasks], [...memos, ...importedMemos], '백업을 기존 데이터에 추가했습니다', [...bundlePmiMemos, ...snapshot.bundlePmiMemos]);
    toast.success('백업을 기존 데이터에 추가했습니다');
  }

  function exportMarkdownHandoffPackage() {
    const markdown = buildSuccessorHandoffMarkdown(tasks, memos, bundlePmiMemos, now());
    download('modoo-insu-group-handoff.md', markdown, 'text/markdown;charset=utf-8');
    setStorageStatus('업무묶음 Markdown 저장 완료');
    toast.success('업무묶음 Markdown 저장 완료');
  }

  async function exportDocxHandoffPackage() {
    setStorageStatus('업무묶음 DOCX 생성 중');
    try {
      const blob = await buildGroupHandoffDocx(tasks, memos, bundlePmiMemos, now());
      downloadBlob('modoo-insu-group-handoff.docx', blob);
      setStorageStatus('업무묶음 DOCX 생성 완료');
      toast.success('업무묶음 DOCX 생성 완료');
    } catch (_error) {
      setStorageStatus('DOCX 파일을 만들지 못했습니다');
      toast.error('DOCX 파일을 만들지 못했습니다');
    }
  }

  const unclassifiedCount = useMemo(
    () => tasks.filter((task) => normalizeTaskGroupName(task.group_name) === UNCLASSIFIED_GROUP_NAME).length,
    [tasks],
  );

  function navigate(nextView: View) {
    if (nextView !== 'archive') setArchiveGroupFocus(null);
    setView(nextView);
  }

  function pickPersona(mode: PersonaMode) {
    writePersonaMode(mode);
    setPersonaMode(mode);
    setView(PERSONA_COPY[mode].defaultView);
    toast.success(`${PERSONA_COPY[mode].label} 모드 — ${PERSONA_COPY[mode].toggleLabel}`);
  }

  function moveStructureCard(taskId: string, patch: StructureCardPatch) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    captureUndo('구조도 이동');
    const targetGroupName = normalizeTaskGroupName(patch.group_name ?? task.group_name);
    const groupChanged = targetGroupName !== normalizeTaskGroupName(task.group_name);
    const targetGroupTask = groupChanged ? tasks.find((item) => normalizeTaskGroupName(item.group_name) === targetGroupName) : null;
    const fallbackColor = targetGroupName === UNCLASSIFIED_GROUP_NAME
      ? DEFAULT_TASK_GROUP_COLOR
      : pickTaskGroupColor([...new Set(tasks.map((item) => item.group_color))]);
    const next = tasks.map((item) =>
      item.id === taskId
        ? {
            ...item,
            group_name: targetGroupName,
            group_color: groupChanged ? targetGroupTask?.group_color ?? fallbackColor : item.group_color,
            job_name: groupChanged ? targetGroupTask?.job_name ?? null : item.job_name,
            category: patch.category !== undefined ? patch.category : item.category,
            updated_at: now(),
          }
        : item,
    );
    saveLocalData(next, memos, '구조도 배치가 로컬 스냅샷에 저장되었습니다');
    if (groupChanged && targetGroupName !== UNCLASSIFIED_GROUP_NAME) {
      writeRuleMemory(learnAssignment(readRuleMemory(), task.title, targetGroupName, targetGroupTask?.job_name ?? null));
      toast.success(`'${targetGroupName}' 배치를 규칙으로 학습했어요 — 다음 업로드부터 자동 배치됩니다`);
    }
  }

  function renameStructureGroup(oldName: string, newName: string) {
    const from = normalizeTaskGroupName(oldName);
    const to = normalizeTaskGroupName(newName);
    if (from === to) return;
    captureUndo('세부업무 이름 변경');
    const mergeTarget = tasks.find((task) => normalizeTaskGroupName(task.group_name) === to);
    const next = tasks.map((task) => (normalizeTaskGroupName(task.group_name) === from
      ? {
          ...task,
          group_name: to,
          group_color: mergeTarget?.group_color ?? task.group_color,
          job_name: mergeTarget ? mergeTarget.job_name ?? null : task.job_name,
          updated_at: now(),
        }
      : task));
    const nextBundlePmiMemos = bundlePmiMemos.map((memo) => (normalizeTaskGroupName(memo.group_name) === from ? { ...memo, group_name: to } : memo));
    saveLocalData(next, memos, `${from} → ${to} 이름이 변경되었습니다`, nextBundlePmiMemos);
    writeRuleMemory(readRuleMemory().map((rule) => (rule.group_name === from ? { ...rule, group_name: to } : rule)));
    toast.success(`세부업무 이름을 ${to}(으)로 바꿨어요`);
  }

  function assignJobToGroup(groupName: string, jobName: string | null) {
    const target = normalizeTaskGroupName(groupName);
    captureUndo('업무 배정');
    const next = tasks.map((task) => (normalizeTaskGroupName(task.group_name) === target ? { ...task, job_name: jobName, updated_at: now() } : task));
    saveLocalData(next, memos, jobName ? `${target} 세부업무를 ${jobName} 업무로 묶었습니다` : `${target} 세부업무의 업무 배정을 해제했습니다`);
    writeRuleMemory(readRuleMemory().map((rule) => (rule.group_name === target ? { ...rule, job_name: jobName } : rule)));
  }

  return (
    <div data-testid="app-shell" className={'flex min-h-screen w-full bg-background text-foreground ' + (presentationMode ? 'presentation-mode' : '')}>
      {personaMode === null ? <PersonaOnboarding onPick={pickPersona} /> : null}
      <AppSidebar active={view} personaMode={personaMode} unclassifiedCount={unclassifiedCount} onPickPersona={pickPersona} presentationMode={presentationMode} onTogglePresentationMode={() => setPresentationMode((value) => !value)} onNavigate={navigate} />
      <div className="min-w-0 flex-1">
        {view === 'calendar' && <YearCalendar tasks={tasks} holidayDates={holidayDates} personaCopy={personaMode ? PERSONA_COPY[personaMode] : undefined} onAddTasks={appendTasks} onLoadSampleDemoData={loadSampleDemoData} onDeleteGroup={deleteTaskGroup} onMoveTask={moveTaskToDate} onUpdateTask={updateTask} />}
        {view === 'structure' && (
          <main className="h-screen overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl space-y-6 p-6 pb-28 md:p-10">
              <PageHeader
                title="업무 구조도"
                subtitle={personaMode === 'receiver'
                  ? '전임자의 카드를 업무 > 세부업무 > 단계 흐름으로 파악합니다. 미분류 카드를 드래그해 정리하세요'
                  : '구조도 1장이 곧 인수인계서입니다. 미분류 카드를 드래그해 세부업무를 만들고 업무로 묶으세요'}
              />
              <StructureBoard tasks={tasks} onMoveCard={moveStructureCard} onRenameGroup={renameStructureGroup} onAssignJob={assignJobToGroup} onGoToCalendar={() => navigate('calendar')} />
            </div>
          </main>
        )}
        {view === 'archive' && <ArchiveScreen tasks={tasks} bundlePmiMemos={bundlePmiMemos} holidayDates={holidayDates} focusedGroupName={archiveGroupFocus} onClearFocusedGroup={() => setArchiveGroupFocus(null)} onDeleteTask={deleteTask} onUpdateTask={updateTask} onUpdateBundlePmiMemos={(next) => saveLocalData(tasks, memos, '업무묶음 Plus/Minus 메모가 저장되었습니다', next)} />}
        {view === 'export' && (
          <ExportScreen
            tasks={tasks}
            memos={memos}
            bundlePmiMemos={bundlePmiMemos}
            onClearAll={clearAll}
            onExportBackup={exportBackup}
            onImportBackupSnapshot={applyBackupSnapshot}
            onExportMarkdownHandoff={exportMarkdownHandoffPackage}
            onExportDocxHandoff={exportDocxHandoffPackage}
          />
        )}
      </div>
      {lastUndo ? (
        <button
          type="button"
          onClick={restoreLastUndo}
          className="fixed bottom-20 right-4 z-50 border border-ember bg-surface px-3 py-2 text-xs font-semibold text-ember shadow-lg hover:bg-ember-soft md:bottom-4"
          aria-label="마지막 작업 되돌리기"
        >
          되돌리기: {lastUndo.label}
        </button>
      ) : null}
      <MobileBottomNav active={view} onNavigate={navigate} />
    </div>
  );
}

function PersonaOnboarding({ onPick }: { onPick: (mode: PersonaMode) => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="시작 모드 선택" className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl border border-border bg-surface p-8 shadow-2xl">
        <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight">
          <span className="size-3 bg-ember" aria-hidden />
          모두의 인수인계
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">공문을 카드로 뽑아 업무 &gt; 세부업무 &gt; 단계 흐름으로 정리합니다. 지금 어느 쪽인가요? (나중에 사이드바에서 바꿀 수 있어요)</p>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {(['giver', 'receiver'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onPick(mode)}
              aria-label={`${PERSONA_COPY[mode].label} 모드로 시작`}
              className="border border-border bg-background p-5 text-left transition-colors hover:border-ember focus:border-ember focus:outline-none"
            >
              <p className="font-mono text-[11px] uppercase tracking-widest text-ember">{PERSONA_COPY[mode].label}</p>
              <p className="mt-1 font-display text-lg font-bold">{PERSONA_COPY[mode].toggleLabel}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{PERSONA_COPY[mode].oneLiner}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AppSidebar({ active, personaMode, unclassifiedCount, onPickPersona, presentationMode, onTogglePresentationMode, onNavigate }: { active: View; personaMode: PersonaMode | null; unclassifiedCount: number; onPickPersona: (mode: PersonaMode) => void; presentationMode: boolean; onTogglePresentationMode: () => void; onNavigate: (view: View) => void }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-background p-6 md:flex">
      <div className="mb-8">
        <button className="block text-left" onClick={() => onNavigate('calendar')}>
          <h1 className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
            <span className="size-3 bg-ember" aria-hidden />
            모두의 인수인계
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">공문 기반 인수인계·캘린더</p>
        </button>
        <div className="mt-4 grid grid-cols-2 gap-1 border border-border bg-surface p-1" role="group" aria-label="인계자 인수자 모드 전환">
          {(['giver', 'receiver'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onPickPersona(mode)}
              aria-pressed={personaMode === mode}
              title={PERSONA_COPY[mode].toggleLabel}
              className={'px-2 py-1.5 text-xs font-semibold transition-colors ' + (personaMode === mode ? 'bg-ember text-ember-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {PERSONA_COPY[mode].label}
            </button>
          ))}
        </div>
        {personaMode ? <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{PERSONA_COPY[personaMode].toggleLabel}</p> : null}
      </div>
      <nav className="flex-1 space-y-1" aria-label="주요 화면">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={
                'flex w-full items-center gap-3 rounded-sm px-2 py-2 text-sm font-medium transition-colors ' +
                (isActive ? 'bg-ember-soft text-ember' : 'text-muted-foreground hover:bg-surface hover:text-foreground')
              }
            >
              <Icon className="size-4" />
              {item.label}
              {item.id === 'structure' && unclassifiedCount > 0 ? (
                <span aria-label={`미분류 ${unclassifiedCount}건`} className="ml-auto rounded-full border border-ember/50 bg-ember-soft px-1.5 py-0.5 font-mono text-[11px] font-bold text-ember">
                  {unclassifiedCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-border/60 pt-4">
        <PresentationModeToggle enabled={presentationMode} onToggle={onTogglePresentationMode} />
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">로컬 저장</p>
        <p className="mt-1 text-xs text-muted-foreground">원본 PDF는 앱 DB/영구 저장소에 저장하지 않습니다</p>
      </div>
    </aside>
  );
}

function MobileBottomNav({ active, onNavigate }: { active: View; onNavigate: (view: View) => void }) {
  return (
    <nav
      aria-label="모바일 주요 화면"
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-background/95 p-2 shadow-2xl backdrop-blur md:hidden"
      style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-label={`모바일 ${item.label} 탭`}
            aria-current={isActive ? 'page' : undefined}
            className={
              'flex min-h-12 flex-col items-center justify-center gap-1 rounded-sm px-1 py-2 text-[11px] font-semibold transition-colors ' +
              (isActive ? 'bg-ember-soft text-ember' : 'text-muted-foreground hover:bg-surface hover:text-foreground')
            }
          >
            <Icon className="size-4" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}





function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-border bg-surface/40 p-12 text-center">
      <p className="font-display text-lg font-semibold">아직 추출된 업무가 없어요</p>
      <p className="max-w-md text-sm text-muted-foreground">위에서 작년 공문 PDF를 업로드하면 업무 후보를 추출해 캘린더와 업무목록에서 확인할 수 있어요.</p>
      <p className="mt-2 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">지원 형식: PDF 여러 개</p>
    </div>
  );
}


const QUADRANT_POSITION_KEY = 'handover:quadrant-positions:v1';

type QuadrantPositionOverrides = Record<string, { xPercent: number; yPercent: number }>;

function clampPercent(value: number) {
  return Math.max(8, Math.min(92, Math.round(value)));
}

function readQuadrantPositionOverrides(): QuadrantPositionOverrides {
  try {
    const raw = localStorage.getItem(QUADRANT_POSITION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as QuadrantPositionOverrides;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeQuadrantPositionOverrides(overrides: QuadrantPositionOverrides) {
  localStorage.setItem(QUADRANT_POSITION_KEY, JSON.stringify(overrides));
}

function BundleQuadrantBoard({ tasks }: { tasks: Task[] }) {
  const quadrants = useMemo(() => buildBundleQuadrants(tasks), [tasks]);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(quadrants[0]?.groupName ?? null);
  const [draggedGroupName, setDraggedGroupName] = useState<string | null>(null);
  const [positionOverrides, setPositionOverrides] = useState<QuadrantPositionOverrides>(() => readQuadrantPositionOverrides());
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (!selectedGroupName && quadrants.length > 0) setSelectedGroupName(quadrants[0].groupName);
  }, [quadrants, selectedGroupName]);
  if (quadrants.length === 0) return null;
  const selectedGroup = quadrants.find((item) => item.groupName === selectedGroupName) ?? quadrants[0];
  const selectedTasks = tasks.filter((task) => normalizeTaskGroupName(task.group_name) === normalizeTaskGroupName(selectedGroup.groupName));
  const monthlyCounts = selectedTasks.reduce<Record<string, number>>((acc, task) => {
    const key = task.start_date.slice(0, 7);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const busiestMonth = Object.entries(monthlyCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  function dropGroup(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!draggedGroupName) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nextX = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * 100 : positionOverrides[draggedGroupName]?.xPercent ?? quadrants.find((item) => item.groupName === draggedGroupName)?.xPercent ?? 50;
    const nextY = rect.height > 0 ? ((rect.bottom - event.clientY) / rect.height) * 100 : positionOverrides[draggedGroupName]?.yPercent ?? quadrants.find((item) => item.groupName === draggedGroupName)?.yPercent ?? 50;
    const next = { ...positionOverrides, [draggedGroupName]: { xPercent: clampPercent(nextX), yPercent: clampPercent(nextY) } };
    setPositionOverrides(next);
    writeQuadrantPositionOverrides(next);
    setSelectedGroupName(draggedGroupName);
    setDraggedGroupName(null);
  }

  return (
    <section aria-label="업무 지형도" className="border border-border bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold">업무 지형도</h3>
          <p className="mt-1 text-xs text-muted-foreground">업무묶음 이름을 드래그해서 위치를 조정하고, 클릭하면 오른쪽에서 업무 성격과 가장 바쁜 때만 봅니다.</p>
        </div>
        <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-muted-foreground">{quadrants.length}개 묶음</span><button type="button" onClick={() => setIsExpanded(true)} className="inline-flex items-center gap-1 border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:border-ember"><Maximize2 className="size-3.5" /> 업무지형도 크게 보기</button></div>
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="relative h-72 border border-border bg-background p-4" aria-label="업무묶음 사분면 산점도" onDragOver={(event) => event.preventDefault()} onDrop={dropGroup}>
          <div className="absolute inset-x-4 top-1/2 border-t border-dashed border-border" aria-hidden />
          <div className="absolute inset-y-4 left-1/2 border-l border-dashed border-border" aria-hidden />
          <span className="absolute left-3 top-3 text-[11px] font-semibold text-muted-foreground">시기 집중 업무</span>
          <span className="absolute right-3 top-3 text-[11px] font-semibold text-muted-foreground">연중 핵심 업무</span>
          <span className="absolute bottom-3 left-3 text-[11px] font-semibold text-muted-foreground">단발성 업무</span>
          <span className="absolute bottom-3 right-3 text-[11px] font-semibold text-muted-foreground">꾸준히 관리</span>
          {quadrants.map((item, index) => {
            const override = positionOverrides[item.groupName];
            const markerNumber = index + 1;
            return (
              <button
                key={item.groupName}
                type="button"
                draggable
                aria-label={`${markerNumber}번 ${item.groupName} 업무 지형도 업무묶음`}
                onClick={() => setSelectedGroupName(item.groupName)}
                onDragStart={() => { setDraggedGroupName(item.groupName); setSelectedGroupName(item.groupName); }}
                className={'absolute flex size-9 -translate-x-1/2 translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 bg-surface text-sm font-extrabold text-foreground shadow-md transition hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-ember active:cursor-grabbing ' + (selectedGroup.groupName === item.groupName ? 'ring-2 ring-ember' : '')}
                style={{ left: `${override?.xPercent ?? item.xPercent}%`, bottom: `${override?.yPercent ?? item.yPercent}%`, borderColor: item.groupColor }}
                title={`${markerNumber}. ${item.groupName} · ${item.quadrantLabel}`}
              >
                <span aria-hidden>{markerNumber}</span>
              </button>
            );
          })}
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-muted-foreground">시기 집중 ↔ 연중 지속</span>
          <span className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 text-[11px] font-semibold text-muted-foreground">공문 적음 ↕ 공문 많음</span>
        </div>
        <aside className="border border-border bg-background p-3 text-xs" aria-label="업무 지형도 상세">
          <p className="font-display text-base font-semibold text-foreground">{selectedGroup.groupName}</p>
          <dl className="mt-3 space-y-2 text-muted-foreground">
            <div><dt className="font-semibold text-foreground">업무 성격</dt><dd>{selectedGroup.quadrantLabel}</dd></div>
            <div><dt className="font-semibold text-foreground">가장 바쁜 때</dt><dd>{busiestMonth ? `${busiestMonth[0]} · ${busiestMonth[1]}건` : '일정 없음'}</dd></div>
          </dl>
        </aside>
      </div>
      <QuadrantLegendTable quadrants={quadrants} tasks={tasks} selectedGroupName={selectedGroup.groupName} onSelect={setSelectedGroupName} />
      {isExpanded ? (
        <div role="dialog" aria-modal="true" aria-label="업무지형도 크게 보기" className="fixed inset-0 z-50 bg-background/95 p-6">
          <div className="mx-auto flex h-full max-w-7xl flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-2xl font-extrabold">업무지형도 크게 보기</h3>
                <p className="text-sm text-muted-foreground">업무 성격과 가장 바쁜 시기만 크게 확인합니다.</p>
              </div>
              <button type="button" onClick={() => setIsExpanded(false)} className="inline-flex items-center gap-1 border border-border px-3 py-2 text-sm font-semibold"><X className="size-4" /> 닫기</button>
            </div>
            <div className="relative min-h-0 flex-1 border border-border bg-surface p-8" aria-label="큰 업무 지형도 산점도" onDragOver={(event) => event.preventDefault()} onDrop={dropGroup}>
              <div className="absolute inset-x-8 top-1/2 border-t border-dashed border-border" aria-hidden />
              <div className="absolute inset-y-8 left-1/2 border-l border-dashed border-border" aria-hidden />
              <span className="absolute left-6 top-6 text-sm font-semibold text-muted-foreground">시기 집중 업무</span>
              <span className="absolute right-6 top-6 text-sm font-semibold text-muted-foreground">연중 핵심 업무</span>
              <span className="absolute bottom-6 left-6 text-sm font-semibold text-muted-foreground">단발성 업무</span>
              <span className="absolute bottom-6 right-6 text-sm font-semibold text-muted-foreground">꾸준히 관리</span>
              {quadrants.map((item, index) => {
                const override = positionOverrides[item.groupName];
                const markerNumber = index + 1;
                return (
                  <button key={item.groupName} type="button" draggable aria-label={`${markerNumber}번 ${item.groupName} 업무 지형도 업무묶음`} onClick={() => setSelectedGroupName(item.groupName)} onDragStart={() => { setDraggedGroupName(item.groupName); setSelectedGroupName(item.groupName); }} className={'absolute flex size-12 -translate-x-1/2 translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 bg-background text-lg font-extrabold shadow-md ' + (selectedGroup.groupName === item.groupName ? 'ring-2 ring-ember' : '')} style={{ left: `${override?.xPercent ?? item.xPercent}%`, bottom: `${override?.yPercent ?? item.yPercent}%`, borderColor: item.groupColor }} title={`${markerNumber}. ${item.groupName} · ${item.quadrantLabel}`}>
                    <span aria-hidden>{markerNumber}</span>
                  </button>
                );
              })}
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-sm font-semibold text-muted-foreground">시기 집중 ↔ 연중 지속</span>
              <span className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-sm font-semibold text-muted-foreground">공문 적음 ↕ 공문 많음</span>
            </div>
            <QuadrantLegendTable quadrants={quadrants} tasks={tasks} selectedGroupName={selectedGroup.groupName} onSelect={setSelectedGroupName} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function busiestMonthLabelForGroup(tasks: Task[], groupName: string) {
  const normalized = normalizeTaskGroupName(groupName);
  const monthlyCounts = tasks
    .filter((task) => normalizeTaskGroupName(task.group_name) === normalized)
    .reduce<Record<string, number>>((acc, task) => {
      const key = task.start_date.slice(0, 7);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  const busiestMonth = Object.entries(monthlyCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return busiestMonth ? `${busiestMonth[0]} · ${busiestMonth[1]}건` : '일정 없음';
}

function QuadrantLegendTable({
  quadrants,
  tasks,
  selectedGroupName,
  onSelect,
}: {
  quadrants: BundleQuadrant[];
  tasks: Task[];
  selectedGroupName: string;
  onSelect: (groupName: string) => void;
}) {
  return (
    <div className="mt-3 overflow-x-auto border border-border bg-background p-3" aria-label="업무 지형도 번호 범례 영역">
      <p className="mb-2 text-xs font-bold text-foreground">업무 지형도 번호 범례</p>
      <table className="w-full min-w-[560px] border-collapse text-left text-xs" aria-label="업무 지형도 번호 범례">
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="w-14 border border-border bg-surface px-2 py-1.5 text-center">번호</th>
            <th scope="col" className="border border-border bg-surface px-2 py-1.5">업무묶음</th>
            <th scope="col" className="border border-border bg-surface px-2 py-1.5">업무 성격</th>
            <th scope="col" className="border border-border bg-surface px-2 py-1.5">가장 바쁜 때</th>
          </tr>
        </thead>
        <tbody>
          {quadrants.map((item, index) => {
            const markerNumber = index + 1;
            const isSelected = selectedGroupName === item.groupName;
            return (
              <tr key={item.groupName} className={isSelected ? 'bg-ember-soft/60' : undefined}>
                <td className="border border-border px-2 py-1.5 text-center font-mono font-bold text-ember">{markerNumber}</td>
                <td className="border border-border px-2 py-1.5">
                  <button type="button" onClick={() => onSelect(item.groupName)} className="inline-flex items-center gap-2 font-semibold text-foreground hover:text-ember focus:outline-none focus:ring-2 focus:ring-ember">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: item.groupColor }} aria-hidden />
                    {item.groupName}
                  </button>
                </td>
                <td className="border border-border px-2 py-1.5 text-muted-foreground">{item.quadrantLabel}</td>
                <td className="border border-border px-2 py-1.5 text-muted-foreground">{busiestMonthLabelForGroup(tasks, item.groupName)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AnnualFlowBoard({
  months,
  bundles,
  maxMonthCount,
  visibleMonthIndex,
  onMonthSelect,
}: {
  months: MonthFlow[];
  bundles: BundleFlow[];
  maxMonthCount: number;
  visibleMonthIndex: number;
  onMonthSelect: (index: number) => void;
}) {
  const visibleMonths = months.map((month, index) => ({ ...month, originalIndex: index }));
  const flowLabel = (month: MonthFlow) => month.year === months[0]?.year ? `올해 ${month.label}` : `다음해 ${month.label}`;
  const visualMonthLabel = (month: MonthFlow) => month.year === months[0]?.year ? month.label : `다음해\n${month.label}`;

  return (
    <section
      aria-label="연간 업무 흐름판"
      className="relative overflow-hidden border border-ember/30 bg-[color-mix(in_oklab,var(--color-ember)_7%,var(--color-surface))] p-4 shadow-sm"
      style={{
        backgroundImage: 'radial-gradient(rgba(154,0,2,0.12) 0.7px, transparent 0.7px)',
        backgroundSize: '12px 12px',
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-display text-xl font-extrabold tracking-tight">연간 흐름</h3>
          <span className="text-xs font-semibold text-muted-foreground">1월부터 다음해 2월까지</span>
        </div>
        <span className="border border-ember/40 bg-background/80 px-3 py-1.5 text-xs font-semibold text-ember">월 클릭 → 아래 달력</span>
      </div>

      <div className="overflow-x-auto" aria-label="월별 업무량 리본">
        <div className="grid min-w-[900px] gap-2" style={{ gridTemplateColumns: `repeat(${visibleMonths.length}, minmax(56px, 1fr))` }}>
          {visibleMonths.map((month) => {
            const intensity = month.count / maxMonthCount;
            const isSelected = month.originalIndex === visibleMonthIndex;
            return (
              <button
                key={month.key}
                type="button"
                aria-label={`${flowLabel(month)} 보기 · ${month.count}건`}
                onClick={() => onMonthSelect(month.originalIndex)}
                className={'min-h-[3.6rem] border px-1.5 py-1.5 text-center transition hover:border-ember focus:border-ember focus:outline-none ' + (isSelected ? 'border-ember bg-background shadow-sm' : 'border-ember/20 bg-background/70')}
                style={{ boxShadow: month.count ? `inset 0 -${Math.max(7, Math.round(38 * intensity))}px 0 color-mix(in oklab, var(--color-ember) ${12 + intensity * 28}%, transparent)` : undefined }}
              >
                <span className="block whitespace-pre-line text-[13px] font-extrabold leading-tight text-foreground">{visualMonthLabel(month)}</span>
                <span className="mt-1.5 inline-flex items-baseline justify-center gap-0.5 whitespace-nowrap">
                  <span className="font-display text-lg font-extrabold leading-none text-ember">{month.count}</span>
                  <span className="text-[11px] font-semibold text-muted-foreground">건</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {bundles.length > 0 ? (
        <div className="mt-4 overflow-x-auto border border-ember/20 bg-background/75 p-3" aria-label="업무묶음별 월분포표">
          <div className="min-w-[860px] space-y-1">
            <div className="grid gap-1 text-[11px] font-semibold text-muted-foreground" style={{ gridTemplateColumns: `80px repeat(${visibleMonths.length}, minmax(50px, 1fr))` }}>
              <span className="text-center">업무묶음</span>
              {visibleMonths.map((month) => <span key={month.key} className="text-center whitespace-nowrap">{visualMonthLabel(month)}</span>)}
            </div>
            {bundles.map((bundle) => (
              <div key={bundle.name} className="grid gap-1" style={{ gridTemplateColumns: `80px repeat(${visibleMonths.length}, minmax(50px, 1fr))` }}>
                <span className="truncate border border-border bg-surface px-2 py-1.5 text-center text-xs font-semibold" title={bundle.name}>{bundle.name}</span>
                {visibleMonths.map((month) => {
                  const count = bundle.counts[month.key] ?? 0;
                  return (
                    <button
                      key={`${bundle.name}-${month.key}`}
                      type="button"
                      aria-label={`${bundle.name} ${flowLabel(month)} ${count}건`}
                      onClick={() => onMonthSelect(month.originalIndex)}
                      className="min-h-8 border bg-surface text-xs font-semibold text-foreground hover:border-ember focus:border-ember focus:outline-none"
                      style={{ borderColor: count ? bundle.color : undefined, backgroundColor: count ? `color-mix(in oklab, ${bundle.color} 12%, var(--color-surface))` : undefined }}
                    >
                      {count}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function YearCalendar({
  tasks,
  holidayDates,
  personaCopy,
  onAddTasks,
  onLoadSampleDemoData,
  onDeleteGroup,
  onMoveTask,
  onUpdateTask,
}: {
  tasks: Task[];
  holidayDates: ReadonlySet<string>;
  personaCopy?: import('./persona').PersonaCopy;
  onAddTasks: (tasks: NewTaskInput[]) => Task[];
  onLoadSampleDemoData: () => void;
  onDeleteGroup: (groupName: string) => void;
  onMoveTask: (id: string, startDate: string) => void;
  onUpdateTask: (task: Task) => void;
}) {
  const visibleTasks = tasks;
  const today = new Date();
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayMonthIndex = today.getMonth();
  const [year, setYear] = useState(today.getFullYear());
  const calendarEndYear = year + 1;
  const calendarMonths = useMemo(() => buildCalendarMonths(year), [year]);
  const [visibleMonthIndex, setVisibleMonthIndex] = useState(todayMonthIndex);
  const currentMonth = calendarMonths[Math.min(visibleMonthIndex, calendarMonths.length - 1)];
  const [selectedDate, setSelectedDate] = useState<string | null>(todayDate);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const draggedTaskIdRef = useRef<string | null>(null);
  const [expandedOverflowDate, setExpandedOverflowDate] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TaskEditDraft | null>(null);
  const [moveNotice, setMoveNotice] = useState('');
  const [isAnnualCalendarExpanded, setIsAnnualCalendarExpanded] = useState(false);
  const dayMap = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of visibleTasks) {
      if (!isInCalendarRange(task, year)) continue;
      map.set(task.start_date, [...(map.get(task.start_date) ?? []), task]);
    }
    return map;
  }, [visibleTasks, year]);
  const maxCount = Math.max(1, ...Array.from(dayMap.values()).map((items) => items.length));
  const selectedTasks = selectedDate ? dayMap.get(selectedDate) ?? [] : [];
  const calendarTaskCount = Array.from(dayMap.values()).reduce((sum, items) => sum + items.length, 0);
  const currentMonthKey = currentMonth.key;
  const currentMonthDisplayLabel = currentMonth.year === year ? currentMonth.label : `다음해 ${currentMonth.label}`;
  const currentMonthTasks = visibleTasks.filter((task) => task.start_date.startsWith(currentMonthKey));
  const annualFlow = useMemo(() => buildAnnualFlow(visibleTasks, calendarMonths), [visibleTasks, calendarMonths]);
  const monthCalendarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (year === today.getFullYear()) {
      setVisibleMonthIndex(todayMonthIndex);
      setSelectedDate(todayDate);
    } else {
      setVisibleMonthIndex(0);
      setSelectedDate(null);
    }
  }, [year]);

  function moveTo(date: string) {
    const taskId = draggedTaskIdRef.current ?? draggedTaskId;
    if (!taskId) return;
    onMoveTask(taskId, date);
    setSelectedDate(date);
    draggedTaskIdRef.current = null;
    setDraggedTaskId(null);
    setMoveNotice(`${date}로 이동됨`);
  }

  function exportYearIcs() {
    const ics = buildRangeIcs(visibleTasks, year);
    download(`modoo-insu-calendar-${year}.ics`, ics, 'text/calendar;charset=utf-8');
    setMoveNotice('캘린더 내보내기(ICS) 완료');
    toast.success('캘린더 내보내기 완료');
  }

  function moveCalendarYear(nextYear: number) {
    setYear(nextYear);
  }

  function patchEditDraft(patch: Partial<TaskEditDraft>) {
    setEditDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function saveCalendarEdit() {
    if (!editDraft) return;
    const original = tasks.find((task) => task.id === editDraft.id);
    if (!original) {
      setEditDraft(null);
      return;
    }
    const title = editDraft.title.trim();
    if (!title || !editDraft.start_date) return;
    const updatedTask: Task = {
      ...original,
      title,
      start_date: editDraft.start_date,
      source_doc: textOrNull(editDraft.source_doc),
      owner: textOrNull(editDraft.owner),
      successor_memo: serializePmiMemo(editDraft),
      updated_at: now(),
    };
    onUpdateTask(updatedTask);
    setSelectedDate(updatedTask.start_date);
    setEditDraft(null);
    toast.success('업무 카드 수정 완료');
  }

  const canSaveEdit = editDraft !== null && editDraft.title.trim().length > 0 && editDraft.start_date.length > 0;

  function goToMonth(index: number, shouldScroll = false) {
    setVisibleMonthIndex(Math.max(0, Math.min(calendarMonths.length - 1, index)));
    setSelectedDate(null);
    setExpandedOverflowDate(null);
    if (shouldScroll) if (typeof monthCalendarRef.current?.scrollIntoView === 'function') monthCalendarRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const currentMonthGridDates = buildMonthGridDates(currentMonth.year, currentMonth.monthIndex);
  const expandedYearMonths = calendarMonths.slice(0, 12);

  function CalendarTaskButton({ task, large = false }: { task: Task; large?: boolean }) {
    const previewLabel = `${task.title} 업무 카드 미리보기`;
    return (
      <button
        key={task.id}
        type="button"
        draggable
        aria-label={`${task.title} ${large ? '큰 연간' : '연간'} 업무 이동`}
        onClick={(e) => { e.stopPropagation(); draggedTaskIdRef.current = task.id; setSelectedDate(task.start_date); }}
        onDragStart={(e) => { e.stopPropagation(); draggedTaskIdRef.current = task.id; setDraggedTaskId(task.id); }}
        className="group relative block w-full min-w-0 cursor-grab overflow-visible border bg-background/90 px-1.5 py-1.5 text-left text-xs font-semibold leading-snug text-foreground hover:z-50 focus:z-50 active:cursor-grabbing"
        style={groupColorStyle(task.group_color)}
        title={task.title}
      >
        <StagePill stage={task.category} compact />
        <span
          className="mt-1 block overflow-hidden leading-snug text-foreground"
          style={{ display: '-webkit-box', WebkitLineClamp: large ? 1 : 2, WebkitBoxOrient: 'vertical' }}
        >
          {truncateCalendarTitle(task.title)}
        </span>
        <span
          aria-label={previewLabel}
          className="pointer-events-none absolute left-0 top-full z-[999] mt-1 hidden w-72 border border-ember/40 bg-surface p-3 text-left text-xs font-normal text-foreground shadow-2xl group-hover:block group-focus:block"
        >
          <span className="block font-semibold">{task.title}</span>
          <span className="mt-1 block text-muted-foreground">{task.source_doc || '문서번호 없음'} · {task.owner || '담당 없음'}</span>
          {task.successor_memo ? <span className="mt-2 block whitespace-pre-wrap text-muted-foreground">{task.successor_memo}</span> : null}
        </span>
      </button>
    );
  }

  function renderLargeMonth(month: CalendarMonth) {
    const monthDays = daysInMonth(month.year, month.monthIndex);
    const firstDay = new Date(month.year, month.monthIndex, 1).getDay();
    return (
      <section key={month.key} aria-label={`${month.year}년 ${month.label} 큰 월력`} className="min-h-[520px] border border-border bg-surface p-4 shadow-sm">
        <h4 className="mb-3 text-center text-xl font-extrabold">{month.year}년 {month.label}</h4>
        <div className="grid grid-cols-7 gap-1.5">
          {['일','월','화','수','목','금','토'].map((d) => <span key={d} className="text-center text-[11px] font-medium text-muted-foreground">{d}</span>)}
          {Array.from({ length: firstDay }).map((_, i) => <span key={`${month.key}-pad-${i}`} />)}
          {Array.from({ length: monthDays }).map((_, di) => {
            const day = di + 1;
            const date = `${month.key}-${String(day).padStart(2, '0')}`;
            const dayTasks = dayMap.get(date) ?? [];
            return (
              <div
                key={date}
                role="button"
                tabIndex={0}
                aria-label={`${date} 큰 연간 날짜칸 ${dayTasks.length}건`}
                onClick={() => { setVisibleMonthIndex(Math.max(0, Math.min(calendarMonths.length - 1, (month.year - year) * 12 + month.monthIndex))); setSelectedDate(date); setIsAnnualCalendarExpanded(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setVisibleMonthIndex(Math.max(0, Math.min(calendarMonths.length - 1, (month.year - year) * 12 + month.monthIndex))); setSelectedDate(date); setIsAnnualCalendarExpanded(false); } }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => moveTo(date)}
                className="relative z-0 flex min-h-28 flex-col overflow-visible border border-border/60 bg-background p-1.5 text-left hover:z-40 hover:border-ember focus:z-40 focus:border-ember focus:outline-none"
              >
                <span className="block shrink-0 text-[11px] font-medium text-muted-foreground">{day}</span>
                <span className="mt-1 block min-h-0 flex-1 space-y-1 overflow-visible pr-0.5">
                  {dayTasks.map((task) => <CalendarTaskButton key={task.id} task={task} large />)}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <main className="h-screen overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-6 p-6 pb-28 md:p-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PageHeader title="연간 캘린더" subtitle="올해 1월부터 다음해 2월까지, 이전/다음 달 버튼으로 한 달씩 안정적으로 확인합니다" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 border border-border bg-surface p-1" aria-label="캘린더 연도 이동">
              <button type="button" onClick={() => moveCalendarYear(year - 1)} className="px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground">이전 해</button>
              <span className="px-2 text-xs font-semibold text-foreground">{year}년 1월 ~ {year + 1}년 2월</span>
              <button type="button" aria-label="오늘 기준 연도로 이동" onClick={() => moveCalendarYear(today.getFullYear())} className="px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground">오늘 기준</button>
              <button type="button" onClick={() => moveCalendarYear(year + 1)} className="px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground">다음 해</button>
            </div>
            <button
              type="button"
              disabled={calendarTaskCount === 0}
              onClick={exportYearIcs}
              className="inline-flex items-center gap-2 border border-ember/50 bg-ember-soft px-3 py-1.5 text-xs font-semibold text-ember hover:bg-ember/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="size-4" /> 캘린더 내보내기(ICS)
            </button>
            <button
              type="button"
              disabled={calendarTaskCount === 0}
              onClick={() => setIsAnnualCalendarExpanded(true)}
              className="inline-flex items-center gap-2 border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:border-ember disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Maximize2 className="size-4" /> 연간캘린더 크게 보기
            </button>
          </div>
        </div>
        {isAnnualCalendarExpanded ? (
          <div role="dialog" aria-modal="true" aria-label="연간캘린더 크게 보기" className="fixed inset-0 z-50 overflow-y-auto bg-background p-6">
            <div className="mx-auto max-w-[1800px] space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl font-extrabold">{year}년 연간캘린더</h3>
                  <p className="text-sm text-muted-foreground">월간 캘린더처럼 날짜칸을 크게 펼쳐 봅니다. 아래로 스크롤하며 1월부터 다음해 2월까지 확인하세요.</p>
                </div>
                <button type="button" onClick={() => setIsAnnualCalendarExpanded(false)} className="inline-flex items-center gap-1 border border-border px-3 py-2 text-sm font-semibold"><X className="size-4" /> 닫기</button>
              </div>
              <div aria-label="큰 연간 월력 넉넉한 그리드" className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
                {expandedYearMonths.map((month) => renderLargeMonth(month))}
              </div>
            </div>
          </div>
        ) : null}
        <IntakeBundleSection tasks={tasks} onAddTasks={onAddTasks} onLoadSampleDemoData={onLoadSampleDemoData} onDeleteGroup={onDeleteGroup} personaCopy={personaCopy} />
        <AnnualFlowBoard
          months={annualFlow.monthsFlow}
          bundles={annualFlow.bundles}
          maxMonthCount={annualFlow.maxMonthCount}
          visibleMonthIndex={visibleMonthIndex}
          onMonthSelect={(index) => goToMonth(index, true)}
        />
        {tasks.length === 0 ? <EmptyState /> : null}
        {tasks.length > 0 ? <BundleQuadrantBoard tasks={tasks} /> : null}
        {moveNotice ? <p className="border border-border bg-surface px-3 py-2 text-xs text-muted-foreground" role="status" aria-live="polite">{moveNotice}</p> : null}
        <div data-testid="calendar-detail-layout" className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <section ref={monthCalendarRef} aria-label="월별 캘린더 본문" className="min-w-0 scroll-mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border border-border bg-surface p-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">선택한 달</p>
                <h3 className="mt-1 text-lg font-semibold">{currentMonthDisplayLabel}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label={`첫 달 ${calendarMonths[0].label} 보기`}
                  disabled={visibleMonthIndex === 0}
                  onClick={() => goToMonth(0)}
                  className="border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  첫 달
                </button>
                <button
                  type="button"
                  aria-label="이전 달"
                  disabled={visibleMonthIndex === 0}
                  onClick={() => goToMonth(visibleMonthIndex - 1)}
                  className="border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  이전 달
                </button>
                <span className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">일정 {currentMonthTasks.length}건</span>
                <button
                  type="button"
                  aria-label="다음 달"
                  disabled={visibleMonthIndex === calendarMonths.length - 1}
                  onClick={() => goToMonth(visibleMonthIndex + 1)}
                  className="border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  다음 달
                </button>
                <button
                  type="button"
                  aria-label={`마지막 달 다음해 ${calendarMonths[calendarMonths.length - 1].label} 보기`}
                  disabled={visibleMonthIndex === calendarMonths.length - 1}
                  onClick={() => goToMonth(calendarMonths.length - 1)}
                  className="border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  마지막 달
                </button>
                <button
                  type="button"
                  disabled={calendarTaskCount === 0}
                  onClick={() => setIsAnnualCalendarExpanded(true)}
                  className="inline-flex items-center gap-1 border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:border-ember disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Maximize2 className="size-3.5" /> 연간캘린더 크게 보기
                </button>
              </div>
            </div>
            <section aria-label={`${currentMonth.year}년 ${currentMonth.label} 캘린더 (${currentMonth.year}년 ${currentMonth.label} 연간 캘린더)`} className="min-w-0 border border-border bg-surface p-4 shadow-sm">
              <div role="grid" aria-label={`${currentMonth.year}년 ${currentMonth.label} 날짜표`} className="grid grid-cols-7 gap-1.5">
                {['일','월','화','수','목','금','토'].map((d) => <span key={d} className="text-center text-[11px] font-medium text-muted-foreground">{d}</span>)}
                {currentMonthGridDates.map((gridDate) => {
                  const { date, day, isCurrentMonth, monthPosition } = gridDate;
                  const dayTasks = dayMap.get(date) ?? [];
                  const shownTasks = expandedOverflowDate === date ? dayTasks : dayTasks.slice(0, 2);
                  const count = dayTasks.length;
                  const intensity = count / maxCount;
                  const adjacentLabel = monthPosition === 'previous' ? '전달 ' : monthPosition === 'next' ? '다음달 ' : '';
                  return (
                    <div
                      key={date}
                      role="button"
                      tabIndex={0}
                      aria-label={`${date} ${adjacentLabel}날짜칸 ${count}건`}
                      onClick={() => setSelectedDate(date)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedDate(date); }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => moveTo(date)}
                      className={'min-h-20 min-w-0 border p-1.5 text-left transition-colors hover:border-ember focus:border-ember focus:outline-none ' + (selectedDate === date ? (isCurrentMonth ? 'border-ember bg-ember-soft' : 'border-ember bg-ember-soft opacity-45') : isCurrentMonth ? 'border-border/50 bg-background' : 'border-border/30 bg-muted/20 opacity-45')}
                      style={{ backgroundColor: count && selectedDate !== date && isCurrentMonth ? `color-mix(in oklab, var(--color-ember) ${7 + intensity * 14}%, var(--color-background))` : undefined }}
                    >
                      <span className={'block text-[11px] font-medium ' + (isCurrentMonth ? 'text-muted-foreground' : 'text-muted-foreground/70')}>{day}</span>
                      <div className="mt-1 space-y-1">
                        {shownTasks.map((task) => <CalendarTaskButton key={task.id} task={task} />)}
                        {dayTasks.length > 2 ? (
                          <button
                            type="button"
                            aria-label={`${date} 숨은 공문 ${dayTasks.length - 2}건 ${expandedOverflowDate === date ? '닫기' : '보기'}`}
                            className="block text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); setExpandedOverflowDate(expandedOverflowDate === date ? null : date); }}
                          >
                            {expandedOverflowDate === date ? '접기' : `+${dayTasks.length - 2}`}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </section>
          <aside aria-label="선택 날짜 상세" className="border border-border bg-surface p-5 2xl:sticky 2xl:top-6 2xl:max-h-[calc(100vh-3rem)] 2xl:overflow-y-auto">
            <h3 className="text-lg font-semibold">선택 날짜 상세</h3>
            <p className="mt-1 text-xs text-muted-foreground">{selectedDate ?? `올해 1월~다음해 2월 전체 ${calendarTaskCount}건`}</p>
            {selectedDate ? (
              selectedTasks.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {selectedTasks.map((task) => (
                    <article key={task.id} className="border border-border bg-background p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          <TaskGroupPill groupName={task.group_name} groupColor={task.group_color} />
                          <p className="text-sm font-semibold">{task.title}</p>
                        </div>
                        <button type="button" onClick={() => setEditDraft(taskToEditDraft(task))} className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs font-semibold text-foreground hover:border-ember" aria-label={`${task.title} 수정`}>
                          <Pencil className="size-3.5" /> 수정
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{task.source_doc || '–'} · {task.owner || '–'}</p>
                      {task.successor_memo ? (
                        <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <div><dt className="text-foreground">Plus / Minus 메모</dt><dd className="whitespace-pre-wrap">{task.successor_memo}</dd></div>
                        </dl>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm text-muted-foreground">선택한 날짜에 추출된 업무가 없습니다.</p>
            ) : (
              <div className="mt-4 border border-border bg-background p-3 text-sm text-muted-foreground">
                공문 제목이 날짜칸 안에 직접 표시됩니다. 제목을 클릭하면 상세가 열리고, 드래그해서 다른 날짜로 옮길 수 있습니다.
              </div>
            )}
          </aside>
        </div>
      </div>
      {editDraft ? (
        <TaskEditDialog
          editDraft={editDraft}
          canSaveEdit={canSaveEdit}
          onPatch={patchEditDraft}
          onCancel={() => setEditDraft(null)}
          onSave={saveCalendarEdit}
        />
      ) : null}
    </main>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <header><h2 className="font-display text-3xl font-extrabold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></header>;
}
