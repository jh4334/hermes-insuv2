import { X } from 'lucide-react';
import type { ExtractedFile, PreviewTaskInput } from '../types';

function displayOrDash(value?: string | null) {
  return value && value.trim().length > 0 ? value : '–';
}

export function PreviewDialog({
  tasks,
  extracted,
  onChange,
  onClose,
  onSave,
  saving,
}: {
  tasks: PreviewTaskInput[];
  extracted: ExtractedFile[];
  onChange: (next: PreviewTaskInput[]) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const canSave = !saving && tasks.length > 0;
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
          <p className="max-w-sm text-xs text-muted-foreground">
            묶음 이름을 미리 정할 필요가 없어요. 다음 단계에서 자동 분류가 세부업무 후보를 제안하고, 애매한 카드는 미분류로 보내 구조도에서 정리합니다.
          </p>
          <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground">취소</button>
          <button disabled={!canSave} onClick={onSave} className="bg-ember px-4 py-1.5 text-sm font-semibold text-ember-foreground hover:brightness-110 disabled:opacity-50">{saving ? '저장 중...' : `${tasks.length}건 자동 분류 제안 보기`}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
