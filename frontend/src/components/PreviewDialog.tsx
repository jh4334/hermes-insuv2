import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { suggestGroupNameFromPreview, uniqueExistingGroups } from '../lib/format';
import type { ExtractedFile, PreviewTaskInput } from '../types';
import type { Task } from '../taskStorage';

function displayOrDash(value?: string | null) {
  return value && value.trim().length > 0 ? value : '–';
}

export function PreviewDialog({
  tasks,
  extracted,
  existingGroups,
  onChange,
  onClose,
  onSave,
  saving,
}: {
  tasks: PreviewTaskInput[];
  extracted: ExtractedFile[];
  existingGroups: ReadonlyArray<Pick<Task, 'group_name' | 'group_color'>>;
  onChange: (next: PreviewTaskInput[]) => void;
  onClose: () => void;
  onSave: (groupName: string) => void;
  saving: boolean;
}) {
  const suggestedGroupName = useMemo(() => (extracted.length > 0 ? suggestGroupNameFromPreview(tasks) : ''), [extracted.length, tasks]);
  const existingGroupOptions = useMemo(() => uniqueExistingGroups(existingGroups), [existingGroups]);
  const [groupName, setGroupName] = useState(suggestedGroupName);
  const canSave = !saving && tasks.length > 0 && groupName.trim().length > 0;
  const hasReceivedDocuments = tasks.some((task) => task.document_type === 'received' || task.sender_org);
  const actorLabel = hasReceivedDocuments ? '발신기관' : '담당';
  const remove = (i: number) => onChange(tasks.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<PreviewTaskInput>) => onChange(tasks.map((task, idx) => (idx === i ? { ...task, ...patch, priority: 'normal' } : task)));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex h-[82vh] w-full max-w-4xl flex-col border border-border bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h3 className="font-display text-lg font-semibold">추출 결과 미리보기</h3>
            <p className="text-xs text-muted-foreground">{extracted.length === 0 ? 'PDF 추출이 어려운 경우 필요한 항목만 직접 입력하세요' : `후보 ${tasks.length}건 · 추가 전에 날짜/문서번호/${actorLabel}을 빠르게 고칩니다`}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="닫기"><X className="size-5" /></button>
        </header>
        <div className="grid flex-1 overflow-hidden md:grid-cols-[1fr_300px]">
          <div className="overflow-y-auto p-4">
            {tasks.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">모든 후보를 제거했어요</p> : (
              <ul className="space-y-3">
                {tasks.map((task, index) => (
                  <li key={`${task.title}-${index}`} className="border border-border bg-background p-3">
                    <div className="grid gap-2 md:grid-cols-[1.2fr_150px]">
                      <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
                        업무명
                        <input aria-label={`${index + 1}번 후보 업무명`} value={task.title} onChange={(e) => update(index, { title: e.target.value })} className="w-full border border-border bg-surface px-2 py-1.5 text-sm font-medium text-foreground outline-none focus:border-ember" />
                      </label>
                      <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
                        기안일
                        <input aria-label={`${index + 1}번 후보 기안일`} type="date" value={task.start_date} onChange={(e) => update(index, { start_date: e.target.value })} className="w-full border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-ember" />
                      </label>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
                        문서번호
                        <input aria-label={`${index + 1}번 후보 문서번호`} value={task.source_doc ?? ''} onChange={(e) => update(index, { source_doc: e.target.value })} className="w-full border border-border bg-surface px-2 py-1.5 text-xs text-foreground outline-none focus:border-ember" />
                      </label>
                      <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
                        {actorLabel}
                        <input aria-label={`${index + 1}번 후보 ${actorLabel}`} value={task.owner ?? ''} onChange={(e) => update(index, { owner: e.target.value, sender_org: hasReceivedDocuments ? e.target.value : task.sender_org })} className="w-full border border-border bg-surface px-2 py-1.5 text-xs text-foreground outline-none focus:border-ember" />
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button onClick={() => remove(index)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive" aria-label="제거"><X className="size-4" /> 제외</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <aside className="overflow-y-auto border-l border-border bg-background/45 p-4">
            <section aria-label="파일별 분석 상태">
              <h4 className="font-display text-sm font-semibold">파일별 분석 상태</h4>
              <div className="mt-3 space-y-2">
                {extracted.map((file) => (
                  <article key={`${file.fileName}-${file.docNumber}-${file.status}`} className="border border-border bg-surface p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="block min-w-0 break-all text-foreground">{file.fileName}</strong>
                      <span className={file.status.includes('실패') ? 'shrink-0 text-ember' : 'shrink-0 text-emerald-700'}>{file.status}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{displayOrDash(file.sourceDate)} · {displayOrDash(file.docNumber)} · {(file.documentType === 'received' || file.senderOrg) ? '발신기관' : '담당'} {displayOrDash(file.senderOrg || file.owner)}</p>
                  </article>
                ))}
              </div>
            </section>
            <section className="mt-5" aria-label="추출 참고 정보">
              <h4 className="font-display text-sm font-semibold">추출 참고 정보</h4>
              <div className="mt-3 space-y-2">
                {extracted.map((file) => (
                  <article key={`${file.fileName}-${file.docNumber}-evidence`} className="border border-border bg-surface p-3 text-xs">
                    <strong className="block text-foreground">{file.title || file.fileName}</strong>
                    <p className="mt-1 text-muted-foreground">{file.status}</p>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </div>
        <footer className="flex flex-col gap-3 border-t border-border px-5 py-3 md:flex-row md:items-end md:justify-between">
          <label className="block max-w-sm flex-1 space-y-1">
            <span className="text-xs font-medium text-foreground">업무묶음 이름</span>
            <input
              aria-label="업무묶음 이름 입력"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="교육과정 또는 계기교육"
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
            />
            <span className="block text-xs text-muted-foreground">
              {suggestedGroupName ? `업무묶음 이름 제안: ${suggestedGroupName} · 교사가 수정 가능` : '업무묶음 이름을 입력해주세요 예) 교육과정, 계기교육'}
            </span>
            {existingGroupOptions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1" aria-label="기존 업무묶음 선택">
                {existingGroupOptions.map((group) => (
                  <button
                    key={group.group_name}
                    type="button"
                    onClick={() => setGroupName(group.group_name)}
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 text-xs font-medium leading-none text-foreground shadow-sm hover:border-ember"
                    aria-label={`기존 묶음 ${group.group_name} 선택`}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: group.group_color }} aria-hidden="true" />
                    {group.group_name}
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground">취소</button>
          <button disabled={!canSave} onClick={() => onSave(groupName)} className="bg-ember px-4 py-1.5 text-sm font-semibold text-ember-foreground hover:brightness-110 disabled:opacity-50">{saving ? '저장 중...' : `${tasks.length}건 보드에 추가`}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
