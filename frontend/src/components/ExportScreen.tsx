import { ChangeEvent, useRef, useState } from 'react';
import { Download, FileText, Loader2, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { readOnlineLlmEnabled, writeOnlineLlmEnabled } from '../classify/llm';
import { readOnlineHolidaysEnabled, writeOnlineHolidaysEnabled } from '../settings';
import { readRuleMemory, writeRuleMemory } from '../classify/ruleMemory';
import { countSuccessorMemos, parsePmiMemo } from '../lib/format';
import { normalizeTaskGroupName } from '../taskGroups';
import { parseLocalBackupText } from '../taskStorage';
import type { BackupImportMode } from '../types';
import type { BundlePmiMemo, LocalDataSnapshot, Memo, Task } from '../taskStorage';

function ExportPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <header><h2 className="font-display text-3xl font-extrabold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></header>;
}

type ExportPreviewRow = {
  readonly groupName: string;
  readonly period: string;
  readonly taskCount: number;
  readonly memoPresence: string;
};

function buildExportPreviewRows(tasks: readonly Task[], bundlePmiMemos: readonly BundlePmiMemo[]): ExportPreviewRow[] {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    const groupName = normalizeTaskGroupName(task.group_name);
    map.set(groupName, [...(map.get(groupName) ?? []), task]);
  }
  return Array.from(map.entries())
    .map(([groupName, groupedTasks]) => {
      const sorted = groupedTasks.slice().sort((a, b) => a.start_date.localeCompare(b.start_date));
      const memo = bundlePmiMemos.find((item) => normalizeTaskGroupName(item.group_name) === groupName);
      const taskMemos = groupedTasks.map((task) => parsePmiMemo(task.successor_memo));
      const hasPlus = Boolean(memo?.pmi_plus.trim()) || taskMemos.some((item) => item.pmi_plus.trim());
      const hasMinus = Boolean(memo?.pmi_minus.trim()) || taskMemos.some((item) => item.pmi_minus.trim());
      return {
        groupName,
        period: sorted.length > 0 ? `${sorted[0].start_date}${sorted[0].start_date === sorted[sorted.length - 1].start_date ? '' : ` ~ ${sorted[sorted.length - 1].start_date}`}` : '일정 없음',
        taskCount: groupedTasks.length,
        memoPresence: `${hasPlus ? 'Plus 있음' : 'Plus 없음'} · ${hasMinus ? 'Minus 있음' : 'Minus 없음'}`,
      };
    })
    .sort((a, b) => a.period.localeCompare(b.period) || a.groupName.localeCompare(b.groupName, 'ko'));
}

function LocalDataPanel({
  tasks,
  memos,
  bundlePmiMemos,
  status,
  onClearAll,
  onExportBackup,
  onImportBackupSnapshot,
  onExportMarkdownHandoff,
  onExportDocxHandoff,
}: {
  tasks: Task[];
  memos: Memo[];
  bundlePmiMemos: BundlePmiMemo[];
  status: string;
  onClearAll: () => void;
  onExportBackup: () => void;
  onImportBackupSnapshot: (snapshot: LocalDataSnapshot, mode: BackupImportMode) => void;
  onExportMarkdownHandoff: () => void;
  onExportDocxHandoff: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [resetPending, setResetPending] = useState(false);
  const [pendingImport, setPendingImport] = useState<LocalDataSnapshot | null>(null);
  const [importing, setImporting] = useState(false);
  const [docxExporting, setDocxExporting] = useState(false);

  async function importFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const result = parseLocalBackupText(text);
      if (!result.ok) {
        toast.error(result.message);
        setPendingImport(null);
        return;
      }
      setPendingImport(result.snapshot);
      if (inputRef.current) inputRef.current.value = '';
    } catch (_error) {
      toast.error('백업 파일을 읽지 못했습니다');
    } finally {
      setImporting(false);
    }
  }

  function applyPendingImport(mode: BackupImportMode) {
    if (!pendingImport) return;
    onImportBackupSnapshot(pendingImport, mode);
    setPendingImport(null);
  }

  function confirmReset() {
    onClearAll();
    setResetPending(false);
  }

  async function exportDocx() {
    setDocxExporting(true);
    try {
      await onExportDocxHandoff();
    } finally {
      setDocxExporting(false);
    }
  }

  const previewRows = buildExportPreviewRows(tasks, bundlePmiMemos);

  return (
    <section className="space-y-4">
      <div className="border border-ember/30 bg-surface p-5 shadow-sm" aria-label="업무묶음별 Plus/Minus 정리">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h3 className="font-display text-lg font-semibold">업무묶음별 Plus/Minus 정리</h3>
            <p className="mt-1 text-xs text-muted-foreground">업무묶음마다 Plus / Minus를 짧게 정리합니다.</p>
            <p className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
              현재 업무 {tasks.length}건 · Plus/Minus 메모 {countSuccessorMemos(tasks)}건
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportDocx} disabled={tasks.length === 0 || docxExporting} className="inline-flex items-center gap-1.5 bg-ember px-4 py-2 text-sm font-semibold text-ember-foreground hover:brightness-110 disabled:opacity-50">
              {docxExporting ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} 업무묶음 DOCX 생성
            </button>
            <button type="button" onClick={onExportMarkdownHandoff} disabled={tasks.length === 0} className="inline-flex items-center gap-1.5 border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-ember hover:text-foreground disabled:opacity-50">
              <FileText className="size-3.5" /> 업무묶음 Markdown 저장
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">원본 PDF와 추출 원문은 포함하지 않고, 업무묶음 흐름·문서번호·기안일·Plus/Minus 메모만 정리합니다.</p>
        <section className="mt-4 border border-border/70 bg-background p-3" aria-label="DOCX/Markdown 출력 미리보기">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-display text-sm font-semibold text-foreground">DOCX/Markdown 출력 미리보기</h4>
            <span className="text-xs font-semibold text-muted-foreground">업무묶음 {previewRows.length}개 · 업무 {tasks.length}건</span>
          </div>
          {previewRows.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">업무묶음</th>
                    <th className="p-2 text-left">기간</th>
                    <th className="p-2 text-center">업무</th>
                    <th className="p-2 text-left">Plus/Minus</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.groupName} className="border-b border-border/60 last:border-b-0">
                      <td className="p-2 font-semibold text-foreground">{row.groupName}</td>
                      <td className="p-2 text-xs text-muted-foreground">{row.period}</td>
                      <td className="p-2 text-center text-xs text-muted-foreground">{row.taskCount}건</td>
                      <td className="p-2 text-xs text-muted-foreground">{row.memoPresence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="mt-3 text-xs text-muted-foreground">내보낼 업무가 없습니다.</p>}
          <p className="mt-3 text-xs text-muted-foreground">원본 PDF, 추출 원문, 참고자료 위치는 포함하지 않습니다.</p>
        </section>
      </div>

      <div className="border border-border bg-surface p-4" aria-label="내 데이터 백업하기">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h3 className="font-display text-base font-semibold">내 데이터 백업하기</h3>
            <p className="mt-1 text-xs text-muted-foreground">앱을 옮기거나 복구할 때만 사용하는 로컬 백업입니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onExportBackup} className="inline-flex items-center gap-1.5 border border-border bg-background px-3 py-2 text-xs font-semibold hover:border-ember">
              <Download className="size-3.5" /> 로컬 백업 저장
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 border border-border bg-background px-3 py-2 text-xs font-semibold hover:border-ember">
              <UploadCloud className="size-3.5" /> 백업 가져오기
            </button>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="로컬 백업 파일 선택"
          onChange={(event: ChangeEvent<HTMLInputElement>) => importFile(event.target.files)}
        />
        {importing ? <p className="mt-3 text-xs text-muted-foreground">백업 파일을 확인하는 중입니다.</p> : null}
        {pendingImport ? (
          <div className="mt-3 border border-ember/30 bg-background p-3 text-xs" role="status" aria-live="polite">
            <p className="font-semibold text-foreground">가져올 백업 확인</p>
            <p className="mt-1 text-muted-foreground">
              업무 {pendingImport.tasks.length}건 · Plus/Minus 메모 {countSuccessorMemos(pendingImport.tasks)}건
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => applyPendingImport('append')} className="border border-ember bg-ember px-3 py-1.5 font-semibold text-ember-foreground">
                기존에 추가
              </button>
              <button type="button" onClick={() => applyPendingImport('replace')} className="border border-border px-3 py-1.5 font-semibold text-foreground hover:border-ember">
                대체
              </button>
              <button type="button" onClick={() => setPendingImport(null)} className="border border-border px-3 py-1.5 font-semibold text-muted-foreground">
                취소
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <LearnedRulesPanel />

      <OnlineLlmPanel />

      <OnlineHolidaysPanel />

      <div className="border border-destructive/30 bg-surface p-4" aria-label="위험 작업">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h3 className="font-display text-base font-semibold text-destructive">위험 작업</h3>
            <p className="mt-1 text-xs text-muted-foreground">전체 초기화는 로컬 업무와 Plus/Minus 메모를 모두 비웁니다.</p>
          </div>
          <button type="button" onClick={() => setResetPending(true)} disabled={tasks.length === 0 && memos.length === 0} className="inline-flex items-center gap-1.5 border border-destructive/50 bg-background px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">
            <Trash2 className="size-3.5" /> 전체 초기화
          </button>
        </div>
        {resetPending ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border border-destructive/40 bg-background p-3 text-xs">
            <span className="text-muted-foreground">필요하면 먼저 로컬 백업 저장을 해두세요.</span>
            <button type="button" onClick={confirmReset} className="border border-destructive px-3 py-1.5 font-semibold text-destructive">
              로컬 데이터 비우기 확인
            </button>
            <button type="button" onClick={() => setResetPending(false)} className="border border-border px-3 py-1.5 text-muted-foreground">
              취소
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LearnedRulesPanel() {
  const [rules, setRules] = useState(() => readRuleMemory());
  const [resetPending, setResetPending] = useState(false);
  const topRules = rules
    .slice()
    .sort((a, b) => b.hits - a.hits || b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);

  function confirmReset() {
    writeRuleMemory([]);
    setRules([]);
    setResetPending(false);
    toast.success('자동 분류 학습 규칙을 초기화했습니다');
  }

  return (
    <div className="border border-border bg-surface p-4" aria-label="자동 분류 학습 규칙">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="flex items-center gap-1.5 font-display text-base font-semibold"><Sparkles className="size-4 text-ember" aria-hidden /> 자동 분류 학습 규칙</h3>
          <p className="mt-1 text-xs text-muted-foreground">카드를 옮기거나 묶음을 확정할 때마다 키워드 → 세부업무 규칙을 기억합니다. 로컬 백업에 함께 저장되어 후임자에게도 전달됩니다.</p>
          <p className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">학습된 규칙 {rules.length}개</p>
        </div>
        <button
          type="button"
          onClick={() => setResetPending(true)}
          disabled={rules.length === 0}
          className="inline-flex items-center gap-1.5 border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-ember hover:text-foreground disabled:opacity-50"
        >
          <Trash2 className="size-3.5" /> 학습 규칙 초기화
        </button>
      </div>
      {topRules.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground" aria-label="자주 쓰인 학습 규칙">
          {topRules.map((rule) => (
            <li key={rule.keyword}>
              <span className="font-semibold text-foreground">{rule.keyword}</span> → {rule.job_name ? `${rule.job_name} / ` : ''}{rule.group_name}
              <span className="ml-1 font-mono text-[11px]">({rule.hits}회)</span>
            </li>
          ))}
        </ul>
      ) : null}
      {resetPending ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border border-destructive/40 bg-background p-3 text-xs">
          <span className="text-muted-foreground">초기화하면 다음 업로드부터 자동 배치가 처음부터 다시 학습됩니다.</span>
          <button type="button" onClick={confirmReset} className="border border-destructive px-3 py-1.5 font-semibold text-destructive">
            학습 규칙 초기화 확인
          </button>
          <button type="button" onClick={() => setResetPending(false)} className="border border-border px-3 py-1.5 text-muted-foreground">
            취소
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OnlineLlmPanel() {
  const [enabled, setEnabled] = useState(() => readOnlineLlmEnabled());

  function toggle(next: boolean) {
    writeOnlineLlmEnabled(next);
    setEnabled(next);
    toast.success(next ? '온라인 LLM 분류를 켰습니다 — 업로드 시 제목만 전송됩니다' : '온라인 LLM 분류를 껐습니다');
  }

  return (
    <div className="border border-border bg-surface p-4" aria-label="온라인 LLM 분류 설정">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="font-display text-base font-semibold">온라인 LLM 분류 (선택)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            켜면 업로드 시 공문 <strong className="text-foreground">제목만</strong> 서버로 보내 업무/세부업무/단계 제안 정확도를 높입니다.
            원문·첨부·개인정보는 전송하지 않으며, 기본값은 꺼짐입니다. 서버에 키가 없거나 실패하면 자동으로 오프라인 규칙 분류를 사용합니다.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="온라인 LLM 분류 사용"
          onClick={() => toggle(!enabled)}
          className={'shrink-0 border px-4 py-2 text-xs font-semibold transition-colors ' + (enabled ? 'border-ember bg-ember text-ember-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground')}
        >
          {enabled ? '켜짐 · 동의함' : '꺼짐'}
        </button>
      </div>
    </div>
  );
}

function OnlineHolidaysPanel() {
  const [enabled, setEnabled] = useState(() => readOnlineHolidaysEnabled());

  function toggle(next: boolean) {
    writeOnlineHolidaysEnabled(next);
    setEnabled(next);
    toast.success(next ? '온라인 공휴일 조회를 켰습니다 — 캘린더를 새로고침하면 반영됩니다' : '온라인 공휴일 조회를 껐습니다');
  }

  return (
    <div className="border border-border bg-surface p-4" aria-label="공휴일 조회 설정">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="font-display text-base font-semibold">공휴일 온라인 조회 (선택)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            기본값은 꺼짐입니다. 꺼져 있으면 <strong className="text-foreground">고정 공휴일</strong>(신정·삼일절·어린이날 등)만 표시하고 외부 인터넷을 쓰지 않습니다.
            설날·추석 같은 음력 공휴일과 대체공휴일까지 정확히 표시하려면 켜세요(연도·국가 코드만 외부에 전송, 개인정보 없음).
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="공휴일 온라인 조회 사용"
          onClick={() => toggle(!enabled)}
          className={'shrink-0 border px-4 py-2 text-xs font-semibold transition-colors ' + (enabled ? 'border-ember bg-ember text-ember-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground')}
        >
          {enabled ? '켜짐 · 동의함' : '꺼짐'}
        </button>
      </div>
    </div>
  );
}

function ExportFooter({ tasks }: { tasks: Task[] }) {
  return (
    <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
      <p><strong className="text-foreground">추출된 일정 {tasks.length}건</strong>을 업무묶음별 Plus/Minus 출력물이나 로컬 백업으로 저장할 수 있습니다.</p>
    </footer>
  );
}

export function ExportScreen({
  tasks,
  memos,
  bundlePmiMemos,
  onClearAll,
  onExportBackup,
  onImportBackupSnapshot,
  onExportMarkdownHandoff,
  onExportDocxHandoff,
}: {
  tasks: Task[];
  memos: Memo[];
  bundlePmiMemos: BundlePmiMemo[];
  onClearAll: () => void;
  onExportBackup: () => void;
  onImportBackupSnapshot: (snapshot: LocalDataSnapshot, mode: BackupImportMode) => void;
  onExportMarkdownHandoff: () => void;
  onExportDocxHandoff: () => Promise<void>;
}) {
  return (
    <main className="h-screen overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6 pb-28 md:p-10">
        <ExportPageHeader title="내보내기" subtitle="백업·가져오기·업무묶음별 Plus/Minus 정리를 한곳에서 처리합니다" />
        <LocalDataPanel
          tasks={tasks}
          memos={memos}
          bundlePmiMemos={bundlePmiMemos}
          status="내보내기 준비됨"
          onClearAll={onClearAll}
          onExportBackup={onExportBackup}
          onImportBackupSnapshot={onImportBackupSnapshot}
          onExportMarkdownHandoff={onExportMarkdownHandoff}
          onExportDocxHandoff={onExportDocxHandoff}
        />
        <ExportFooter tasks={tasks} />
      </div>
    </main>
  );
}
