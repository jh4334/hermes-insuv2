import { X } from 'lucide-react';
import type { TaskEditDraft } from '../types';

export function TaskEditDialog({
  editDraft,
  canSaveEdit,
  onPatch,
  onCancel,
  onSave,
}: {
  editDraft: TaskEditDraft;
  canSaveEdit: boolean;
  onPatch: (patch: Partial<TaskEditDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="edit-task-title">
      <div className="w-full max-w-2xl border border-border bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h3 id="edit-task-title" className="font-display text-lg font-semibold">업무 수정</h3>
            <p className="text-xs text-muted-foreground">저장된 업무의 핵심 항목과 Plus / Minus 메모를 따로 수정합니다.</p>
          </div>
          <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="업무 수정 닫기"><X className="size-5" /></button>
        </header>
        <div className="grid gap-3 p-5 md:grid-cols-[1fr_160px]">
          <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
            업무명
            <input aria-label="수정 업무명" value={editDraft.title} onChange={(event) => onPatch({ title: event.target.value })} className="w-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-ember" />
          </label>
          <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
            날짜
            <input aria-label="수정 날짜" type="date" value={editDraft.start_date} onChange={(event) => onPatch({ start_date: event.target.value })} className="w-full border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-ember" />
          </label>
          <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
            문서번호
            <input aria-label="수정 문서번호" value={editDraft.source_doc} onChange={(event) => onPatch({ source_doc: event.target.value })} className="w-full border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ember" />
          </label>
          <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
            담당자
            <input aria-label="수정 담당자" value={editDraft.owner} onChange={(event) => onPatch({ owner: event.target.value })} className="w-full border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ember" />
          </label>
          <label className="space-y-1 text-[11px] font-semibold text-muted-foreground md:col-span-2">
            Plus
            <textarea aria-label="수정 Plus" value={editDraft.pmi_plus} onChange={(event) => onPatch({ pmi_plus: event.target.value })} placeholder="좋았던 점" rows={2} className="w-full resize-y border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ember" />
          </label>
          <label className="space-y-1 text-[11px] font-semibold text-muted-foreground md:col-span-2">
            Minus
            <textarea aria-label="수정 Minus" value={editDraft.pmi_minus} onChange={(event) => onPatch({ pmi_minus: event.target.value })} placeholder="아쉬웠던 점" rows={2} className="w-full resize-y border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ember" />
          </label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onCancel} className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground">취소</button>
          <button type="button" disabled={!canSaveEdit} onClick={onSave} className="bg-ember px-4 py-1.5 text-sm font-semibold text-ember-foreground hover:brightness-110 disabled:opacity-50">수정 저장</button>
        </footer>
      </div>
    </div>
  );
}
