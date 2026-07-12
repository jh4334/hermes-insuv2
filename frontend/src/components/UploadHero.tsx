import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import {
  cardsToTasks,
  pdfExtractionSummaryMessage,
  pdfFailureMessageWithGuidance,
} from '../lib/format';
import { classifyCards } from '../classify/engine';
import type { ClassifyResult } from '../classify/engine';
import { fetchLlmSuggestions, mergeLlmSuggestions, readOnlineLlmEnabled } from '../classify/llm';
import {
  UNCLASSIFIED_GROUP_NAME,
  learnAssignment,
  readRuleMemory,
  writeRuleMemory,
} from '../classify/ruleMemory';
import { DEFAULT_TASK_GROUP_COLOR, normalizeTaskGroupName, pickTaskGroupColor } from '../taskGroups';
import type { PersonaCopy } from '../persona';
import type { ExtractedFile, NewTaskInput, PreviewTaskInput } from '../types';
import type { Task } from '../taskStorage';
import { ClassifyReviewDialog } from './ClassifyReviewDialog';
import type { BucketAssignment } from './ClassifyReviewDialog';
import { PreviewDialog } from './PreviewDialog';

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string; message?: string; messages?: string[] };
    if (Array.isArray(payload.messages) && payload.messages.length > 0) return payload.messages.join(' ');
    return payload.message || payload.error || fallback;
  } catch {
    return fallback;
  }
}

async function extractPdfs(files: File[], targetYear: number, documentType: 'draft' | 'received'): Promise<import('../types').ExtractResponse> {
  const form = new FormData();
  form.set('targetYear', String(targetYear));
  form.set('documentType', documentType);
  files.forEach((file) => form.append('files', file));
  const response = await fetch('/api/extract-pdfs', { method: 'POST', body: form });
  if (!response.ok) throw new Error(await readErrorMessage(response, `PDF extraction failed: ${response.status}`));
  return response.json() as Promise<import('../types').ExtractResponse>;
}

function createManualPreviewTask(targetYear: number): PreviewTaskInput {
  const today = new Date().toISOString().slice(5, 10);
  return {
    title: '직접 입력 업무',
    description: 'PDF 추출 실패 시 교사가 직접 입력한 업무 후보',
    start_date: `${targetYear}-${today}`,
    end_date: null,
    category: '계획',
    priority: 'normal',
    source_doc: null,
    owner: null,
    reference_location: null,
    successor_memo: null,
  };
}

export function UploadHero({
  existingGroups,
  onAddTasks,
  onLoadSampleDemoData,
  hasExistingTasks,
  personaCopy,
}: {
  existingGroups: ReadonlyArray<Pick<Task, 'group_name' | 'group_color'>>;
  onAddTasks: (tasks: NewTaskInput[]) => Task[];
  onLoadSampleDemoData: () => void;
  hasExistingTasks: boolean;
  personaCopy?: PersonaCopy;
}) {
  const currentYear = new Date().getFullYear();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [targetYear, setTargetYear] = useState(currentYear);
  const [documentType, setDocumentType] = useState<'draft' | 'received'>('draft');
  const [preview, setPreview] = useState<PreviewTaskInput[] | null>(null);
  const [review, setReview] = useState<ClassifyResult | null>(null);
  const [extracted, setExtracted] = useState<ExtractedFile[]>([]);
  const [message, setMessage] = useState('PDF 여러 개 선택 가능 · 원본 파일은 앱 DB/영구 저장소에 저장하지 않습니다');
  const [messageTone, setMessageTone] = useState<'info' | 'error' | 'success'>('info');
  const [sampleConfirmOpen, setSampleConfirmOpen] = useState(false);

  function requestSampleDemoData() {
    if (hasExistingTasks) {
      setSampleConfirmOpen(true);
      return;
    }
    onLoadSampleDemoData();
  }

  function confirmSampleDemoData() {
    onLoadSampleDemoData();
    setSampleConfirmOpen(false);
  }

  async function onFiles(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;
    const invalid = selected.filter((file) => file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'));
    if (invalid.length > 0) {
      setMessage(pdfFailureMessageWithGuidance(`PDF 형식만 선택할 수 있습니다: ${invalid.map((file) => file.name).join(', ')}`));
      setMessageTone('error');
      toast.error('PDF 파일만 선택하세요');
      return;
    }
    setBusy(true);
    setMessageTone('info');
    setMessage(`PDF ${selected.length}개 분석 중... ${documentType === 'received' ? '접수공문의 날짜·문서번호·발신기관을 읽고 있습니다.' : '기안문 날짜·문서번호·담당자를 읽고 있습니다.'}`);
    try {
      const result = await extractPdfs(selected, targetYear, documentType);
      const tasks = cardsToTasks(result.analysis.board.cards);
      setPreview(tasks);
      setExtracted(result.extractedFiles);
      setMessage(pdfExtractionSummaryMessage(tasks.length, result.extractedFiles));
      setMessageTone('success');
      toast.success(`${tasks.length}개 후보 추출 — 확인 후 추가하세요`);
    } catch (error) {
      const text = error instanceof Error ? error.message : '파싱 실패';
      setMessage(pdfFailureMessageWithGuidance(text));
      setMessageTone('error');
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  async function openClassifyReview() {
    if (!preview || preview.length === 0) return;
    let result = classifyCards(preview.map((task) => ({ title: task.title, category: task.category })), readRuleMemory());
    if (readOnlineLlmEnabled()) {
      // 옵트인한 경우에만 제목만 전송. 실패하면 조용히 오프라인 결과를 쓴다.
      const suggestions = await fetchLlmSuggestions(preview.map((task) => task.title));
      if (suggestions) {
        result = mergeLlmSuggestions(result, suggestions);
        toast.success('온라인 LLM 분류 제안을 반영했어요');
      }
    }
    setReview(result);
  }

  function saveAssignments(assignments: BucketAssignment[]) {
    const colorByGroup = new Map<string, string>();
    for (const group of existingGroups) {
      const name = normalizeTaskGroupName(group.group_name);
      if (!colorByGroup.has(name)) colorByGroup.set(name, group.group_color);
    }
    let rules = readRuleMemory();
    const inputs: NewTaskInput[] = assignments.map((assignment) => {
      const groupName = normalizeTaskGroupName(assignment.groupName);
      let groupColor = colorByGroup.get(groupName);
      if (!groupColor) {
        groupColor = groupName === UNCLASSIFIED_GROUP_NAME ? DEFAULT_TASK_GROUP_COLOR : pickTaskGroupColor([...colorByGroup.values()]);
        colorByGroup.set(groupName, groupColor);
      }
      if (groupName !== UNCLASSIFIED_GROUP_NAME) {
        rules = learnAssignment(rules, assignment.task.title, groupName, assignment.jobName);
      }
      return {
        ...assignment.task,
        priority: 'normal',
        category: assignment.stage,
        job_name: assignment.jobName,
        project_name: assignment.projectName,
        group_name: groupName,
        group_color: groupColor,
      };
    });
    writeRuleMemory(rules);
    const saved = onAddTasks(inputs);
    setReview(null);
    setPreview(null);
    const groupCount = new Set(inputs.map((input) => input.group_name)).size;
    toast.success(`${saved.length}개 업무를 ${groupCount}개 묶음으로 추가했습니다 — 구조도에서 마저 정리하세요`);
  }

  function openManualEntry() {
    setPreview([createManualPreviewTask(targetYear)]);
    setExtracted([]);
    setMessage('PDF 추출이 어려운 경우 필요한 항목만 직접 입력할 수 있습니다');
    setMessageTone('info');
  }

  return (
    <>
      <section
        aria-label="공문 PDF 업로드 카드"
        className="group relative h-full"
        onDragOver={(e: DragEvent) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e: DragEvent<HTMLElement>) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
      >
        <div className="absolute -inset-0.5 bg-ember/10 opacity-0 blur-xl transition-opacity duration-700 group-hover:opacity-100" />
        <div className={'relative flex h-full min-h-52 flex-col items-center justify-center overflow-hidden border bg-surface p-6 transition-colors ' + (dragOver ? 'border-ember' : 'border-border')}>
          {busy && <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ember/80 to-transparent animate-scan" />}
          <div className="z-10 flex flex-col items-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-ember/40">
              {busy ? <Loader2 className="size-5 animate-spin text-ember" /> : <UploadCloud className="size-5 text-ember" />}
            </div>
            <div>
              <h2 className="mb-1 font-display text-lg font-semibold">{busy ? '공문 분석 중...' : personaCopy?.uploadTitle ?? '공문 PDF 업로드'}</h2>
              <p className="text-sm text-muted-foreground">{busy ? '공문에서 필요한 정보를 확인하는 중입니다' : personaCopy?.uploadSubtitle ?? '문서를 우르르 올리면 자동 분류가 세부업무 후보를 제안합니다'}</p>
              <p className="mt-2 text-xs text-muted-foreground" role={messageTone === 'error' ? 'alert' : 'status'} aria-live="polite">{message}</p>
            </div>
          </div>
          <input ref={inputRef} type="file" multiple accept="application/pdf,.pdf" className="hidden" onClick={(e) => { e.currentTarget.value = ''; }} onChange={(e: ChangeEvent<HTMLInputElement>) => onFiles(e.target.files)} aria-label="PDF 공문 파일 선택" />
          <button disabled={busy} onClick={() => inputRef.current?.click()} className="z-10 mt-4 bg-ember px-6 py-2 text-sm font-semibold text-ember-foreground transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? '처리 중...' : '파일 선택하기'}
          </button>
          <button type="button" disabled={busy} onClick={requestSampleDemoData} className="z-10 mt-2 border border-ember/40 bg-background px-4 py-1.5 text-xs font-semibold text-ember hover:bg-ember-soft disabled:opacity-60">
            샘플 데이터로 둘러보기
          </button>
          <fieldset aria-label="문서 종류" className="z-10 mt-3 flex items-center gap-1 border border-border bg-background p-1 text-xs">
            <legend className="sr-only">문서 종류</legend>
            {[
              { label: '기안문', value: 'draft' as const },
              { label: '접수공문', value: 'received' as const },
            ].map((option) => (
              <label key={option.value} className={'cursor-pointer px-3 py-1.5 font-semibold transition-colors ' + (documentType === option.value ? 'bg-ember text-ember-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <input
                  type="radio"
                  name="pdf-document-type"
                  value={option.value}
                  checked={documentType === option.value}
                  onChange={() => setDocumentType(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <p className="z-10 mt-1 text-[11px] text-muted-foreground">접수공문은 담당자 대신 발신기관을 우선 가져옵니다</p>
          <p className="z-10 mt-1 text-[11px] text-muted-foreground">실제 학교·교사·학생 정보가 없는 가상 데이터</p>
          {sampleConfirmOpen ? (
            <div className="z-10 mt-3 max-w-md border border-ember/30 bg-background p-3 text-xs text-left">
              <p className="font-semibold text-foreground">기존 로컬 데이터가 있습니다</p>
              <p className="mt-1 text-muted-foreground">샘플 업무는 기존 업무를 지우지 않고 뒤에 추가됩니다.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={confirmSampleDemoData} className="border border-ember bg-ember px-3 py-1.5 font-semibold text-ember-foreground">
                  샘플 데이터 추가
                </button>
                <button type="button" onClick={() => setSampleConfirmOpen(false)} className="border border-border px-3 py-1.5 font-semibold text-muted-foreground">
                  취소
                </button>
              </div>
            </div>
          ) : null}
          {messageTone === 'error' ? (
            <button type="button" onClick={openManualEntry} className="z-10 mt-2 border border-border px-4 py-1.5 text-xs font-semibold text-foreground hover:border-ember">
              직접 입력하기
            </button>
          ) : null}
          <fieldset aria-label="PDF 대상연도" className="z-10 mt-4 flex items-center gap-1 border border-border bg-background p-1 text-xs">
            <legend className="sr-only">PDF 대상연도</legend>
            {[
              { label: '올해', value: currentYear },
              { label: '내년', value: currentYear + 1 },
            ].map((option) => (
              <label key={option.value} className={'cursor-pointer px-3 py-1.5 font-semibold transition-colors ' + (targetYear === option.value ? 'bg-ember text-ember-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <input
                  type="radio"
                  name="pdf-target-year"
                  value={option.value}
                  checked={targetYear === option.value}
                  onChange={() => setTargetYear(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        </div>
      </section>
      {preview && !review && <PreviewDialog tasks={preview} extracted={extracted} onChange={setPreview} onClose={() => setPreview(null)} onSave={openClassifyReview} saving={busy} />}
      {preview && review && (
        <ClassifyReviewDialog
          tasks={preview}
          classification={review}
          existingGroups={existingGroups}
          onConfirm={saveAssignments}
          onClose={() => setReview(null)}
        />
      )}
    </>
  );
}
