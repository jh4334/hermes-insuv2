import { Maximize2 } from 'lucide-react';

export function PresentationModeToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      className="inline-flex items-center gap-1.5 border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground shadow-sm hover:border-ember"
    >
      <Maximize2 className="size-3.5" />
      {enabled ? '일반 보기' : '발표 보기'}
    </button>
  );
}
