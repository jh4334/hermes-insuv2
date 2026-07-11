import { useMemo, useState } from 'react';
import { UploadHero } from './UploadHero';
import { TaskGroupPill } from '../TaskGroupControls';
import { normalizeTaskGroupName } from '../taskGroups';
import type { PersonaCopy } from '../persona';
import type { Task } from '../taskStorage';
import type { NewTaskInput } from '../types';

export function IntakeBundleSection({
  tasks,
  onAddTasks,
  onLoadSampleDemoData,
  onDeleteGroup,
  personaCopy,
}: {
  tasks: Task[];
  onAddTasks: (tasks: NewTaskInput[]) => Task[];
  onLoadSampleDemoData: () => void;
  onDeleteGroup: (groupName: string) => void;
  personaCopy?: PersonaCopy;
}) {
  return (
    <section aria-label="PDF 업로드와 업무묶음 관리" className="grid items-stretch gap-4 lg:grid-cols-2">
      <UploadHero existingGroups={tasks.map((task) => ({ group_name: task.group_name, group_color: task.group_color }))} onAddTasks={onAddTasks} onLoadSampleDemoData={onLoadSampleDemoData} hasExistingTasks={tasks.length > 0} personaCopy={personaCopy} />
      <BundleManager tasks={tasks} onDeleteGroup={onDeleteGroup} />
    </section>
  );
}

function BundleManager({ tasks, onDeleteGroup }: { tasks: Task[]; onDeleteGroup: (groupName: string) => void }) {
  const [confirmingGroup, setConfirmingGroup] = useState<string | null>(null);
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; color: string; count: number }>();
    for (const task of tasks) {
      const name = normalizeTaskGroupName(task.group_name);
      const current = map.get(name);
      map.set(name, { name, color: current?.color ?? task.group_color, count: (current?.count ?? 0) + 1 });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  function confirmDelete(groupName: string) {
    onDeleteGroup(groupName);
    setConfirmingGroup(null);
  }

  return (
    <aside aria-label="업무묶음 관리 카드" className="h-full border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">업무묶음 관리</h2>
          <p className="mt-1 text-xs text-muted-foreground">PDF를 여러 번 추가해도 업무묶음별로 빼낼 수 있어요.</p>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{groups.length}개</span>
      </div>
      {groups.length === 0 ? (
        <p className="mt-6 border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">아직 추가된 업무묶음이 없습니다.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {groups.map((group) => (
            <li key={group.name} className="border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <TaskGroupPill groupName={group.name} groupColor={group.color} />
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{group.count}건</p>
                </div>
                <button
                  type="button"
                  aria-label={`${group.name} 업무묶음 삭제`}
                  onClick={() => setConfirmingGroup(group.name)}
                  className="shrink-0 border border-destructive/50 px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10"
                >
                  삭제
                </button>
              </div>
              {confirmingGroup === group.name ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border border-destructive/40 bg-surface p-2 text-xs">
                  <span className="text-muted-foreground">{group.name} {group.count}건 삭제 확인</span>
                  <button type="button" onClick={() => confirmDelete(group.name)} className="border border-destructive px-2 py-1 font-semibold text-destructive" aria-label={`${group.name} 삭제 확정`}>
                    삭제 확정
                  </button>
                  <button type="button" onClick={() => setConfirmingGroup(null)} className="border border-border px-2 py-1 text-muted-foreground">
                    취소
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
