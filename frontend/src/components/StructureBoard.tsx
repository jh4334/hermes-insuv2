import { useMemo, useState } from 'react';
import { AlertTriangle, Inbox, Pencil, Plus, X } from 'lucide-react';
import { UNCLASSIFIED_GROUP_NAME } from '../classify/ruleMemory';
import { detectReworkLoop } from '../classify/stageRules';
import { normalizeWorkflowCardStage } from '../lib/format';
import { DEFAULT_TASK_GROUP_COLOR, normalizeTaskGroupName } from '../taskGroups';
import { WORKFLOW_CARD_STAGES } from '../theme/tokens';
import { TaskGroupPill } from '../TaskGroupControls';
import type { Task } from '../taskStorage';
import type { WorkflowCardStage } from '../types';

/**
 * 업무 구조도(기획 문서 §3·§6): 구조도 1장 = 세부업무 1개.
 * 업무(예: 계기교육) 아래 세부업무(예: 통일) 스윔레인이 놓이고,
 * 각 레인은 계획 → 심의·협의 → 품의 → 결과보고 단계 흐름으로 카드를 배치한다.
 * 미분류 인박스의 카드를 드래그해 세부업무를 만들고, 세부업무를 업무로 묶는다.
 * 카드를 다른 세부업무로 옮기면 앱이 키워드 규칙을 학습한다(오답 학습).
 */

const NO_STAGE_COLUMN = '단계미정';
const UNASSIGNED_JOB_LABEL = '업무 미지정';

/** 단계별 책임 주체 레인(기획 §6 스윔레인 2축의 경량판): 열마다 책임 주체를 표시한다. */
const STAGE_ACTORS: Record<string, string> = {
  계획: '담당',
  '심의·협의': '위원회·심의기구',
  품의: '담당·행정실',
  결과보고: '담당',
  [NO_STAGE_COLUMN]: '',
};

/** 접수공문(외부기관 발신) 카드 여부 — 외부 책임 주체 표시에 쓴다. */
function isExternalTask(task: Task): boolean {
  return task.document_type === 'received' || Boolean(task.sender_org?.trim());
}

export type StructureCardPatch = {
  readonly group_name?: string;
  readonly category?: string | null;
};

type StructureGroup = {
  readonly name: string;
  readonly color: string;
  readonly jobName: string | null;
  readonly tasks: Task[];
};

type GroupCheck = {
  readonly tone: 'warn' | 'info';
  readonly message: string;
};

function stageOfTask(task: Task): WorkflowCardStage | typeof NO_STAGE_COLUMN {
  return normalizeWorkflowCardStage(task.category) ?? NO_STAGE_COLUMN;
}

export function buildStructureGroups(tasks: Task[]): StructureGroup[] {
  const map = new Map<string, { color: string; jobName: string | null; tasks: Task[] }>();
  for (const task of tasks) {
    const name = normalizeTaskGroupName(task.group_name);
    const current = map.get(name) ?? { color: task.group_color, jobName: null, tasks: [] };
    current.tasks.push(task);
    if (!current.jobName && task.job_name?.trim()) current.jobName = task.job_name.trim();
    map.set(name, current);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, ...value, tasks: value.tasks.slice().sort((a, b) => a.start_date.localeCompare(b.start_date)) }))
    .sort((a, b) => {
      if (a.name === UNCLASSIFIED_GROUP_NAME) return -1;
      if (b.name === UNCLASSIFIED_GROUP_NAME) return 1;
      return a.name.localeCompare(b.name, 'ko');
    });
}

export function groupChecks(group: StructureGroup): GroupCheck[] {
  if (group.name === UNCLASSIFIED_GROUP_NAME) return [];
  const counts = { 계획: 0, '심의·협의': 0, 품의: 0, 결과보고: 0, [NO_STAGE_COLUMN]: 0 } as Record<string, number>;
  for (const task of group.tasks) counts[stageOfTask(task)] += 1;
  const checks: GroupCheck[] = [];
  if ((counts['계획'] > 0 || counts['품의'] > 0) && counts['결과보고'] === 0) {
    checks.push({ tone: 'warn', message: '결과보고 미등록' });
  }
  if (group.tasks.some((task) => detectReworkLoop(task.title))) {
    checks.push({ tone: 'info', message: '보완 루프 있음' });
  }
  if (counts['결과보고'] > 0 && counts['품의'] === 0 && counts['계획'] > 0) {
    checks.push({ tone: 'info', message: '품의 건너뜀' });
  }
  if (group.tasks.length >= 3 && counts['계획'] === group.tasks.length) {
    checks.push({ tone: 'info', message: '계획에 몰림' });
  }
  return checks;
}

export function StructureBoard({
  tasks,
  onMoveCard,
  onRenameGroup,
  onAssignJob,
  onGoToCalendar,
}: {
  tasks: Task[];
  onMoveCard: (taskId: string, patch: StructureCardPatch) => void;
  onRenameGroup: (oldName: string, newName: string) => void;
  onAssignJob: (groupName: string, jobName: string | null) => void;
  onGoToCalendar?: () => void;
}) {
  const groups = useMemo(() => buildStructureGroups(tasks), [tasks]);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [pendingGroupNames, setPendingGroupNames] = useState<string[]>([]);
  const pendingGroups: StructureGroup[] = pendingGroupNames
    .filter((name) => !groups.some((group) => group.name === name))
    .map((name) => ({ name, color: DEFAULT_TASK_GROUP_COLOR, jobName: null, tasks: [] }));

  function addPendingGroup() {
    const name = normalizeTaskGroupName(newGroupName);
    if (!newGroupName.trim() || name === UNCLASSIFIED_GROUP_NAME) return;
    if (groups.some((group) => group.name === name) || pendingGroupNames.includes(name)) {
      setNewGroupName('');
      return;
    }
    setPendingGroupNames((current) => [...current, name]);
    setNewGroupName('');
  }

  const jobNames = useMemo(
    () => [...new Set(groups.map((group) => group.jobName).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b, 'ko')),
    [groups],
  );

  const unclassified = groups.find((group) => group.name === UNCLASSIFIED_GROUP_NAME);
  const classifiedGroups = groups.filter((group) => group.name !== UNCLASSIFIED_GROUP_NAME);

  const jobSections = useMemo(() => {
    const map = new Map<string, StructureGroup[]>();
    for (const group of classifiedGroups) {
      const key = group.jobName ?? UNASSIGNED_JOB_LABEL;
      map.set(key, [...(map.get(key) ?? []), group]);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === UNASSIGNED_JOB_LABEL) return 1;
      if (b[0] === UNASSIGNED_JOB_LABEL) return -1;
      return a[0].localeCompare(b[0], 'ko');
    });
  }, [classifiedGroups]);

  function dropOnCell(groupName: string, column: string) {
    if (!draggedTaskId) return;
    const patch: StructureCardPatch = {
      group_name: groupName,
      category: column === NO_STAGE_COLUMN ? null : column,
    };
    onMoveCard(draggedTaskId, patch);
    setDraggedTaskId(null);
  }

  function commitRename(group: StructureGroup) {
    const next = renameValue.trim();
    setRenamingGroup(null);
    if (!next || next === group.name) return;
    onRenameGroup(group.name, next);
  }

  function renderStageCell(group: StructureGroup, column: string) {
    const cellTasks = group.tasks.filter((task) => stageOfTask(task) === column);
    return (
      <div
        role="list"
        aria-label={`${group.name} ${column} 칸 ${cellTasks.length}건`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => dropOnCell(group.name, column)}
        className="min-h-16 space-y-1 border border-border/50 bg-background p-1.5"
      >
        {cellTasks.map((task) => (
          <button
            key={task.id}
            type="button"
            draggable
            role="listitem"
            aria-label={`${task.title} 구조도 카드`}
            onDragStart={() => setDraggedTaskId(task.id)}
            onDragEnd={() => setDraggedTaskId(null)}
            title={`${task.title} · ${task.start_date}${isExternalTask(task) && task.sender_org ? ` · 발신: ${task.sender_org}` : ''}`}
            className="block w-full cursor-grab border bg-surface px-1.5 py-1 text-left text-[11px] font-medium leading-snug text-foreground hover:border-ember active:cursor-grabbing"
            style={{ borderColor: group.color }}
          >
            <span className="block truncate">{task.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1">
              <span className="font-mono text-[10px] text-muted-foreground">{task.start_date}</span>
              {task.project_name ? <span className="rounded-full border border-sky-200 bg-sky-50 px-1 text-[10px] font-semibold text-sky-700">{task.project_name}</span> : null}
              {detectReworkLoop(task.title) ? <span className="rounded-full border border-ember/40 bg-ember-soft px-1 text-[10px] font-semibold text-ember">보완↩</span> : null}
              {isExternalTask(task) ? <span className="rounded-full border border-violet-200 bg-violet-50 px-1 text-[10px] font-semibold text-violet-700">외부</span> : null}
            </span>
          </button>
        ))}
      </div>
    );
  }

  function renderGroupLane(group: StructureGroup, isInbox = false, isPending = false) {
    const checks = groupChecks(group);
    return (
      <section
        aria-label={`${group.name} 세부업무 레인`}
        className={'border p-3 ' + (isInbox ? 'border-dashed border-ember/40 bg-ember-soft/30' : isPending ? 'border-dashed border-border bg-surface/70' : 'border-border bg-surface')}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {isInbox ? <Inbox className="size-4 text-ember" aria-hidden /> : null}
          {renamingGroup === group.name ? (
            <input
              autoFocus
              aria-label={`${group.name} 세부업무 이름 수정`}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onBlur={() => commitRename(group)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename(group);
                if (event.key === 'Escape') setRenamingGroup(null);
              }}
              className="w-40 border border-ember bg-background px-2 py-1 text-sm font-semibold outline-none"
            />
          ) : (
            <TaskGroupPill groupName={group.name} groupColor={group.color} />
          )}
          {isPending ? (
            <>
              <span className="text-[11px] text-muted-foreground">미분류 카드를 끌어다 놓으면 만들어져요</span>
              <button
                type="button"
                aria-label={`${group.name} 빈 레인 삭제`}
                onClick={() => setPendingGroupNames((current) => current.filter((name) => name !== group.name))}
                className="ml-auto text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </>
          ) : null}
          {!isInbox && !isPending && renamingGroup !== group.name ? (
            <button
              type="button"
              aria-label={`${group.name} 이름 수정`}
              onClick={() => { setRenamingGroup(group.name); setRenameValue(group.name); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
          ) : null}
          <span className="font-mono text-[11px] text-muted-foreground">{group.tasks.length}건</span>
          {checks.map((check) => (
            <span
              key={check.message}
              className={
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ' +
                (check.tone === 'warn' ? 'border-ember/50 bg-ember-soft text-ember' : 'border-amber-300 bg-amber-50 text-amber-800')
              }
            >
              <AlertTriangle className="size-3" aria-hidden /> {check.message}
            </span>
          ))}
          {!isInbox && !isPending ? (
            <label className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
              업무
              <input
                aria-label={`${group.name} 상위 업무 배정`}
                list="structure-job-names"
                defaultValue={group.jobName ?? ''}
                key={`${group.name}:${group.jobName ?? ''}`}
                placeholder="예: 계기교육"
                onBlur={(event) => {
                  const next = event.target.value.trim() || null;
                  if (next !== (group.jobName ?? null)) onAssignJob(group.name, next);
                }}
                onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                className="w-28 border border-border bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-ember"
              />
            </label>
          ) : null}
        </div>
        {isInbox ? (
          <p className="mb-2 text-[11px] text-muted-foreground">확신이 낮았던 카드예요. 아래 세부업무 레인의 단계 칸으로 드래그하면 규칙을 학습해 다음부터 자동 배치합니다.</p>
        ) : null}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${WORKFLOW_CARD_STAGES.length + 1}, minmax(0, 1fr))` }}>
          {[...WORKFLOW_CARD_STAGES, NO_STAGE_COLUMN].map((column) => (
            <div key={column} className="min-w-0">
              <p className="mb-1 text-center text-[10px] font-semibold text-muted-foreground">
                {column}
                {STAGE_ACTORS[column] ? <span className="block font-normal text-muted-foreground/80">{STAGE_ACTORS[column]}</span> : null}
              </p>
              {renderStageCell(group, column)}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-border bg-surface/40 p-12 text-center">
        <p className="font-display text-lg font-semibold">구조도에 놓을 카드가 아직 없어요</p>
        <p className="max-w-md text-sm text-muted-foreground">캘린더 화면에서 공문 PDF를 우르르 올리면 자동 분류가 세부업무 후보를 제안하고, 여기서 업무 &gt; 세부업무 &gt; 단계 흐름으로 정리할 수 있어요.</p>
        {onGoToCalendar ? (
          <button type="button" onClick={onGoToCalendar} className="mt-2 bg-ember px-5 py-2 text-sm font-semibold text-ember-foreground hover:brightness-110">
            캘린더에서 공문 업로드하러 가기
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <datalist id="structure-job-names">
        {jobNames.map((name) => <option key={name} value={name} />)}
      </datalist>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-border bg-surface px-3 py-2 text-[11px] text-muted-foreground" aria-label="구조도 흐름 범례">
        <span className="font-semibold text-foreground">{WORKFLOW_CARD_STAGES.join(' → ')}</span>
        <span><span className="font-semibold text-ember">보완↩</span> 반려·재기안으로 되돌아온 카드</span>
        <span><span className="font-semibold text-violet-700">외부</span> 외부기관 발신(접수) 공문</span>
        <span><span className="font-semibold text-sky-700">파란 태그</span> 세부업무 안의 사업(예: 통일교육주간)</span>
      </div>
      {unclassified ? renderGroupLane(unclassified, true) : null}
      <div className="flex flex-wrap items-center gap-2 border border-border bg-surface p-3" aria-label="새 세부업무 만들기">
        <Plus className="size-4 text-ember" aria-hidden />
        <input
          aria-label="새 세부업무 이름"
          value={newGroupName}
          onChange={(event) => setNewGroupName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') addPendingGroup(); }}
          placeholder="예: 통일, 안전교육"
          className="w-44 border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ember"
        />
        <button
          type="button"
          onClick={addPendingGroup}
          disabled={!newGroupName.trim()}
          className="border border-ember bg-ember px-3 py-1.5 text-xs font-semibold text-ember-foreground hover:brightness-110 disabled:opacity-50"
        >
          새 세부업무 추가
        </button>
        <span className="text-[11px] text-muted-foreground">빈 레인을 만든 뒤 미분류 카드를 끌어다 놓으세요</span>
      </div>
      {pendingGroups.map((group) => <div key={group.name}>{renderGroupLane(group, false, true)}</div>)}
      {jobSections.map(([jobName, jobGroups]) => (
        <section key={jobName} aria-label={`${jobName} 업무 구역`} className="space-y-2">
          <h3 className="flex items-baseline gap-2 font-display text-base font-extrabold tracking-tight">
            {jobName}
            <span className="font-mono text-[11px] font-normal text-muted-foreground">세부업무 {jobGroups.length}개 · {jobGroups.reduce((sum, group) => sum + group.tasks.length, 0)}건</span>
          </h3>
          <div className="space-y-3">
            {jobGroups.map((group) => <div key={group.name}>{renderGroupLane(group)}</div>)}
          </div>
        </section>
      ))}
    </div>
  );
}
