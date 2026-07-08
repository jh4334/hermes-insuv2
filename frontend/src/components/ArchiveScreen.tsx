import { useEffect, useMemo, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { TaskGroupPill } from '../TaskGroupControls';
import { displayOrDash, parsePmiMemo } from '../lib/format';
import { filterAndSortArchiveTasks } from '../lib/archiveFilters';
import { normalizeTaskGroupName } from '../taskGroups';
import type { BundlePmiMemo, Task } from '../taskStorage';
import type { ArchiveQuickFilter } from '../types';
import type { ArchiveSortMode } from '../lib/archiveFilters';

function now() {
  return new Date().toISOString();
}

function ArchivePageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <header><h2 className="font-display text-3xl font-extrabold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></header>;
}

function legacyBundleMemo(groupName: string, tasks: readonly Task[]): BundlePmiMemo | null {
  const plus = Array.from(new Set(tasks.flatMap((task) => parsePmiMemo(task.successor_memo).pmi_plus.split('\n')).map((line) => line.trim()).filter(Boolean))).join('\n');
  const minus = Array.from(new Set(tasks.flatMap((task) => parsePmiMemo(task.successor_memo).pmi_minus.split('\n')).map((line) => line.trim()).filter(Boolean))).join('\n');
  if (!plus && !minus) return null;
  return { group_name: groupName, pmi_plus: plus, pmi_minus: minus, created_at: now(), updated_at: now() };
}

type BundleSection = {
  readonly name: string;
  readonly color: string;
  readonly tasks: Task[];
  readonly memo: BundlePmiMemo | null;
};

type BundleMemoDraft = Pick<BundlePmiMemo, 'pmi_plus' | 'pmi_minus'>;

function BundleMemoEditor({ section, savedMemo, onSave }: { section: BundleSection; savedMemo: BundlePmiMemo | null; onSave: (groupName: string, draft: BundleMemoDraft, displayedMemo: BundlePmiMemo | null) => void }) {
  const [draft, setDraft] = useState<BundleMemoDraft>({ pmi_plus: savedMemo?.pmi_plus ?? '', pmi_minus: savedMemo?.pmi_minus ?? '' });
  const [showSaved, setShowSaved] = useState(false);
  const isDirty = draft.pmi_plus !== (savedMemo?.pmi_plus ?? '') || draft.pmi_minus !== (savedMemo?.pmi_minus ?? '');

  useEffect(() => {
    setDraft({ pmi_plus: savedMemo?.pmi_plus ?? '', pmi_minus: savedMemo?.pmi_minus ?? '' });
  }, [savedMemo?.pmi_plus, savedMemo?.pmi_minus]);

  function patchDraft(patch: Partial<BundleMemoDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setShowSaved(false);
  }

  function handleSave() {
    onSave(section.name, draft, savedMemo);
    setShowSaved(true);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TaskGroupPill groupName={section.name} groupColor={section.color} />
          <span className="text-xs text-muted-foreground">{section.tasks.length}건</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <span className="text-muted-foreground">작성 후 저장 버튼을 눌러야 반영됩니다</span>
          {isDirty ? <span className="border border-amber-300 bg-amber-50 px-2 py-1 font-semibold text-amber-800">저장 전 변경사항 있음</span> : null}
          {!isDirty && showSaved ? <span className="border border-emerald-300 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">저장 완료</span> : null}
          <button
            type="button"
            aria-label={`${section.name} Plus/Minus 저장`}
            disabled={!isDirty}
            onClick={handleSave}
            className="inline-flex items-center gap-1 bg-ember px-3 py-1.5 font-semibold text-ember-foreground hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Save className="size-3.5" /> 저장
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-semibold text-muted-foreground">
          Plus 메모
          <textarea
            aria-label={`${section.name} Plus 메모`}
            value={draft.pmi_plus}
            onChange={(event) => patchDraft({ pmi_plus: event.currentTarget.value })}
            placeholder="좋았던 점"
            rows={3}
            className="mt-1 w-full resize-y border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
          />
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">
          Minus 메모
          <textarea
            aria-label={`${section.name} Minus 메모`}
            value={draft.pmi_minus}
            onChange={(event) => patchDraft({ pmi_minus: event.currentTarget.value })}
            placeholder="아쉬웠던 점"
            rows={3}
            className="mt-1 w-full resize-y border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
          />
        </label>
      </div>
    </>
  );
}

function Archive({
  tasks,
  bundlePmiMemos,
  onDeleteTask,
  onUpdateTask,
  onUpdateBundlePmiMemos,
}: {
  tasks: Task[];
  bundlePmiMemos: BundlePmiMemo[];
  holidayDates?: ReadonlySet<string>;
  focusedGroupName?: string | null;
  onClearFocusedGroup?: () => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (task: Task) => void;
  onUpdateBundlePmiMemos: (memos: BundlePmiMemo[]) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<ArchiveQuickFilter>('all');
  const [sortMode, setSortMode] = useState<ArchiveSortMode>('date-asc');

  const visibleTasks = useMemo(() => filterAndSortArchiveTasks(tasks, searchQuery, quickFilter, sortMode), [tasks, searchQuery, quickFilter, sortMode]);

  const sections = useMemo<BundleSection[]>(() => {
    const map = new Map<string, Task[]>();
    for (const task of visibleTasks) {
      const name = normalizeTaskGroupName(task.group_name);
      map.set(name, [...(map.get(name) ?? []), task]);
    }
    return Array.from(map.entries())
      .map(([name, groupedTasks]) => ({
        name,
        color: groupedTasks[0]?.group_color ?? '#9a0002',
        tasks: groupedTasks,
        memo: bundlePmiMemos.find((memo) => normalizeTaskGroupName(memo.group_name) === name) ?? legacyBundleMemo(name, tasks.filter((task) => normalizeTaskGroupName(task.group_name) === name)),
      }))
      .sort((a, b) => sortMode === 'group' ? a.name.localeCompare(b.name, 'ko') : 0);
  }, [tasks, visibleTasks, bundlePmiMemos, sortMode]);


  function saveBundleMemo(groupName: string, draft: BundleMemoDraft, displayedMemo: BundlePmiMemo | null) {
    const normalized = normalizeTaskGroupName(groupName);
    const current = bundlePmiMemos.find((memo) => normalizeTaskGroupName(memo.group_name) === normalized);
    const nextMemo: BundlePmiMemo = {
      group_name: normalized,
      pmi_plus: draft.pmi_plus,
      pmi_minus: draft.pmi_minus,
      created_at: current?.created_at ?? displayedMemo?.created_at ?? now(),
      updated_at: now(),
    };
    const withoutCurrent = bundlePmiMemos.filter((memo) => normalizeTaskGroupName(memo.group_name) !== normalized);
    const next = (nextMemo.pmi_plus.trim() || nextMemo.pmi_minus.trim()) ? [...withoutCurrent, nextMemo] : withoutCurrent;
    onUpdateBundlePmiMemos(next);
  }

  return (
    <main className="h-screen overflow-y-auto">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-6 pb-28 md:p-10">
        <ArchivePageHeader title="업무목록" subtitle="업무묶음마다 Plus/Minus 메모를 한 번만 적고, 아래에서 공문 목록을 확인합니다" />
        {tasks.length > 0 ? (
          <section className="grid gap-3 border border-border bg-surface p-4 md:grid-cols-[minmax(0,1fr)_180px_180px]" aria-label="업무목록 조건">
            <label className="block text-xs font-semibold text-muted-foreground">
              업무목록 검색
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="업무명, 문서번호, 담당, 업무묶음"
                className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-semibold text-muted-foreground">
              업무목록 필터
              <select value={quickFilter} onChange={(event) => setQuickFilter(event.currentTarget.value as ArchiveQuickFilter)} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember">
                <option value="all">전체</option>
                <option value="doc-missing">문서번호 없음</option>
                <option value="owner-missing">담당 없음</option>
                <option value="missing-result">결과보고 후보</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted-foreground">
              업무목록 정렬
              <select value={sortMode} onChange={(event) => setSortMode(event.currentTarget.value as ArchiveSortMode)} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember">
                <option value="date-asc">날짜 오름차순</option>
                <option value="date-desc">날짜 내림차순</option>
                <option value="title">업무명순</option>
                <option value="group">업무묶음순</option>
              </select>
            </label>
          </section>
        ) : null}
        {tasks.length === 0 ? <p className="border border-border bg-surface p-6 text-center text-sm text-muted-foreground">저장된 업무가 없습니다.</p> : null}
        {tasks.length > 0 && sections.length === 0 ? <p className="border border-border bg-surface p-6 text-center text-sm text-muted-foreground">조건에 맞는 업무가 없습니다.</p> : null}
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.name} aria-label={`${section.name} 업무묶음 메모`} className="border border-border bg-surface p-4">
              <BundleMemoEditor section={section} savedMemo={section.memo} onSave={saveBundleMemo} />
              <div className="mt-4 overflow-x-auto border border-border/70 bg-background">
                <table className="w-full min-w-[900px] text-center text-sm">
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr>
                      <th className="whitespace-nowrap p-3">날짜</th>
                      <th className="p-3 text-center">업무묶음</th>
                      <th className="p-3 text-center">업무명</th>
                      <th className="whitespace-nowrap p-3">문서번호</th>
                      <th className="whitespace-nowrap p-3">담당</th>
                      <th className="sticky right-0 bg-background p-3 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.tasks.map((task) => (
                      <tr key={task.id} className="border-b border-border/60 align-middle last:border-b-0">
                        <td className="whitespace-nowrap p-3 font-mono text-xs">{task.start_date}</td>
                        <td className="whitespace-nowrap p-3 text-center"><TaskGroupPill groupName={section.name} groupColor={section.color} /></td>
                        <td className="whitespace-nowrap p-3 text-center"><span>{task.title}</span></td>
                        <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{displayOrDash(task.source_doc)}</td>
                        <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{displayOrDash(task.owner)}</td>
                        <td className="sticky right-0 bg-background p-3 text-center shadow-[-8px_0_12px_-12px_rgba(47,39,35,0.45)]">
                          <div className="flex flex-wrap justify-center gap-2">
                            <button type="button" onClick={() => onDeleteTask(task.id)} className="inline-flex items-center gap-1 border border-destructive/40 px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10">
                              <Trash2 className="size-3" /> 삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

export const ArchiveScreen = Archive;
