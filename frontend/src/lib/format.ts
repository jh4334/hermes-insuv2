import { normalizeTaskGroupName } from '../taskGroups';
import type { Task } from '../taskStorage';
import {
  CALENDAR_TITLE_LIMIT,
  DEFAULT_GROUP_COLOR,
  WORKFLOW_CARD_STAGES,
  WORKFLOW_STAGES,
} from '../theme/tokens';
import type {
  AnalysisCard,
  BundleFlow,
  CalendarMonth,
  ExtractedFile,
  MonthFlow,
  PreviewTaskInput,
  TaskEditDraft,
  WorkflowCardStage,
  WorkflowStage,
  WorkflowSummary,
} from '../types';
import { addDaysIso, isInCalendarRange, isValidIsoDate } from './dates';

const GROUP_NAME_STOPWORDS = new Set([
  '안내',
  '계획',
  '운영',
  '결과보고',
  '결과',
  '보고',
  '제출',
  '시행',
  '추진',
  '관련',
  '협조',
  '학교',
  '공문',
  '업무',
]);

function now() {
  return new Date().toISOString();
}

function isBadPdfFormatMessage(message: string): boolean {
  return message.includes('PDF 형식이 아닌 파일') || message.includes('PDF 파일만') || message.includes('PDF 형식만');
}

function isTextlessPdfMessage(message: string): boolean {
  return message.includes('스캔 PDF') || message.includes('텍스트 없음') || message.includes('텍스트가 없는');
}

function extractedFileLooksTextless(file: ExtractedFile): boolean {
  return isTextlessPdfMessage(`${file.status} ${file.evidence}`);
}

export function pdfFailureMessageWithGuidance(message: string): string {
  if (isBadPdfFormatMessage(message)) {
    return `${message} · 원본 PDF를 선택하거나 PDF로 다시 저장한 뒤 다시 선택해 주세요`;
  }
  if (isTextlessPdfMessage(message)) {
    return '스캔 PDF이거나 텍스트가 없는 파일이에요 · 직접 입력하기를 사용하거나 글자를 선택할 수 있는 PDF를 올려 주세요';
  }
  return `${message} · 필요한 항목을 직접 입력하거나 PDF를 다시 선택하세요`;
}

export function pdfExtractionSummaryMessage(taskCount: number, extractedFiles: readonly ExtractedFile[]): string {
  const textlessFiles = extractedFiles.filter(extractedFileLooksTextless);
  if (textlessFiles.length === extractedFiles.length && textlessFiles.length > 0) {
    return `${taskCount}개 후보 추출 완료 · 스캔 PDF이거나 텍스트가 없는 파일이에요 · 직접 입력하기를 사용할 수 있어요`;
  }
  return `${taskCount}개 후보 추출 완료 · 업무묶음 이름을 정한 뒤 달력에 추가하세요`;
}

export function cardsToTasks(cards: AnalysisCard[]): PreviewTaskInput[] {
  return cards.map((card) => {
    const isReceivedDocument = card.documentType === 'received';
    const senderOrg = card.senderOrg || (isReceivedDocument ? card.owner : '');
    const actorLine = isReceivedDocument && senderOrg ? `\n발신기관: ${senderOrg}` : card.owner ? `\n담당: ${card.owner}` : '';
    return {
      title: card.title,
      description: `${card.sourceTitle}\n근거: ${card.referenceLabel}${actorLine}`,
      start_date: card.targetDate,
      end_date: null,
      category: card.stage || null,
      priority: 'normal',
      source_doc: card.docNumber || card.referenceLabel,
      owner: card.owner || null,
      document_type: card.documentType || 'draft',
      sender_org: senderOrg || null,
      reference_location: card.referenceLocation || 'K-에듀파인 또는 공문함',
      successor_memo: null,
    };
  });
}

export function countSuccessorMemos(tasks: Task[]): number {
  return tasks.filter((task) => (task.successor_memo ?? '').trim().length > 0).length;
}

export function missingResultGroupNames(tasks: Task[]): Set<string> {
  return new Set(buildWorkflowSummaries(tasks).filter((summary) => summary.hasMissingResultReport).map((summary) => summary.groupName));
}

export function actionableMissingResultGroupNames(tasks: Task[]): Set<string> {
  return missingResultGroupNames(tasks);
}

export function icsDate(value: string): string {
  return value.replaceAll('-', '');
}

export function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}

export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = '';
  for (const char of Array.from(line)) {
    const next = `${current}${char}`;
    if (current && encoder.encode(next).length > 73) {
      chunks.push(current);
      current = ` ${char}`;
    } else {
      current = next;
    }
  }
  chunks.push(current);
  return chunks.join('\r\n');
}

export function taskYear(task: Task): number {
  return Number(task.start_date.slice(0, 4));
}

export function truncateCalendarTitle(title: string) {
  return title.length > CALENDAR_TITLE_LIMIT ? `${title.slice(0, CALENDAR_TITLE_LIMIT)}…` : title;
}

export function groupColorStyle(color: string) {
  return {
    borderColor: color,
    color: 'var(--color-foreground)',
    backgroundColor: `color-mix(in oklab, ${color} 10%, var(--color-background))`,
  };
}

export function normalizeWorkflowStage(stage?: string | null): WorkflowStage | null {
  if (!stage) return null;
  if (stage === '보고') return '결과보고';
  if (stage === '예산') return '품의';
  return WORKFLOW_STAGES.includes(stage as WorkflowStage) ? (stage as WorkflowStage) : null;
}

export function normalizeWorkflowCardStage(stage?: string | null): WorkflowCardStage | null {
  if (!stage) return null;
  if (stage === '보고') return '결과보고';
  if (stage === '예산') return '품의';
  return WORKFLOW_CARD_STAGES.includes(stage as WorkflowCardStage) ? (stage as WorkflowCardStage) : null;
}

export function buildWorkflowSummaries(tasks: Task[]): WorkflowSummary[] {
  const map = new Map<string, WorkflowSummary>();
  for (const task of tasks) {
    const key = normalizeTaskGroupName(task.group_name);
    const current = map.get(key) ?? {
      groupName: key,
      groupColor: task.group_color,
      counts: { 계획: 0, 품의: 0, 결과보고: 0 },
      hasMissingResultReport: false,
    };
    const stage = normalizeWorkflowCardStage(task.category);
    if (stage) current.counts[stage] += 1;
    map.set(key, current);
  }
  return Array.from(map.values())
    .filter((summary) => WORKFLOW_CARD_STAGES.some((stage) => summary.counts[stage] > 0))
    .map((summary) => ({
      ...summary,
      hasMissingResultReport: (summary.counts['계획'] > 0 || summary.counts['품의'] > 0) && summary.counts['결과보고'] === 0,
    }))
    .sort((a, b) => a.groupName.localeCompare(b.groupName, 'ko'));
}

export function buildAnnualIcs(tasks: Task[], year: number, yearSpan = 1): string {
  const endYearExclusive = year + yearSpan;
  const events = tasks
    .filter((task) => {
      const yearValue = taskYear(task);
      return yearValue >= year && yearValue < endYearExclusive;
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.title.localeCompare(b.title))
    .map((task) => {
      const groupName = task.group_name;
      const endDate = task.end_date && isValidIsoDate(task.end_date) && task.end_date >= task.start_date ? task.end_date : task.start_date;
      const description = [
        task.source_doc ? `문서번호: ${task.source_doc}` : '',
        task.owner ? `담당: ${task.owner}` : '',
        `업무묶음: ${groupName}`,
        task.successor_memo ? `Plus/Minus 메모: ${task.successor_memo}` : '',
      ].filter(Boolean).join('\n');
      return [
        'BEGIN:VEVENT',
        `UID:${escapeIcsText(`modoo-insu-${task.id}@local`)}`,
        `DTSTAMP:${icsDate(now().slice(0, 10))}T000000Z`,
        `SUMMARY:${escapeIcsText(task.title)}`,
        `DTSTART;VALUE=DATE:${icsDate(task.start_date)}`,
        `DTEND;VALUE=DATE:${icsDate(addDaysIso(endDate, 1))}`,
        `CATEGORIES:${escapeIcsText(groupName)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        'END:VEVENT',
      ].map(foldIcsLine).join('\r\n');
    });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Modoo Insu//Local Annual Calendar//KO', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR', ''].map(foldIcsLine).join('\r\n');
}

export function buildRangeIcs(tasks: Task[], year: number): string {
  return buildAnnualIcs(tasks.filter((task) => isInCalendarRange(task, year)), year, 2);
}

export function buildAnnualFlow(tasks: Task[], months: CalendarMonth[]) {
  const monthKeys = new Set(months.map((month) => month.key));
  const monthTasks = new Map<string, Task[]>();
  const bundleTasks = new Map<string, { color: string; counts: Record<string, number>; total: number }>();

  for (const task of tasks) {
    const monthKey = task.start_date.slice(0, 7);
    if (!monthKeys.has(monthKey)) continue;
    monthTasks.set(monthKey, [...(monthTasks.get(monthKey) ?? []), task]);
    const groupName = task.group_name || '미분류';
    const current = bundleTasks.get(groupName) ?? { color: task.group_color || DEFAULT_GROUP_COLOR, counts: {}, total: 0 };
    current.counts[monthKey] = (current.counts[monthKey] ?? 0) + 1;
    current.total += 1;
    bundleTasks.set(groupName, current);
  }

  const monthsFlow: MonthFlow[] = months.map((month) => {
    const items = monthTasks.get(month.key) ?? [];
    return { ...month, count: items.length };
  });

  const bundles: BundleFlow[] = [...bundleTasks.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ko'))
    .slice(0, 5);

  const maxMonthCount = Math.max(1, ...monthsFlow.map((month) => month.count));
  return { monthsFlow, bundles, maxMonthCount };
}

export function suggestGroupNameFromPreview(tasks: PreviewTaskInput[]) {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const normalized = task.title
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/\b\d{4}\b/g, ' ')
      .replace(/[0-9.()·ㆍ,/_-]+/g, ' ');
    for (const token of normalized.match(/[가-힣A-Za-z]{2,}/g) ?? []) {
      const candidate = token.trim();
      if (candidate.length < 2 || GROUP_NAME_STOPWORDS.has(candidate)) continue;
      counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
}

export function uniqueExistingGroups(existingGroups: ReadonlyArray<Pick<Task, 'group_name' | 'group_color'>>) {
  const map = new Map<string, Pick<Task, 'group_name' | 'group_color'>>();
  for (const group of existingGroups) {
    const name = normalizeTaskGroupName(group.group_name);
    if (!name || map.has(name)) continue;
    map.set(name, { group_name: name, group_color: group.group_color });
  }
  return [...map.values()].sort((a, b) => a.group_name.localeCompare(b.group_name));
}

export function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function displayOrDash(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : '–';
}

export function isSampleTask(task: Task): boolean {
  return task.id.startsWith('sample-') || (task.source_doc ?? '').startsWith('SAMPLE-');
}


export function parsePmiMemo(value: string | null | undefined): Pick<TaskEditDraft, 'pmi_plus' | 'pmi_minus'> {
  const result = { pmi_plus: '', pmi_minus: '' };
  const text = value?.trim() ?? '';
  if (!text) return result;
  const lines = text.split(/\r?\n/);
  const usedLines: string[] = [];
  let currentKey: keyof typeof result | 'ignored' | null = null;
  const appendToCurrent = (line: string) => {
    if (!currentKey) {
      usedLines.push(line);
      return;
    }
    if (currentKey === 'ignored') return;
    result[currentKey] = [result[currentKey], line].filter((part) => part.length > 0).join('\n').trim();
  };
  for (const line of lines) {
    const match = line.match(/^\s*(Plus|P|Minus|M|Interesting|I)\s*[:：]\s*(.*)$/i);
    if (!match) {
      appendToCurrent(line);
      continue;
    }
    const key = match[1].toLowerCase();
    currentKey = key === 'plus' || key === 'p' ? 'pmi_plus' : key === 'minus' || key === 'm' ? 'pmi_minus' : 'ignored';
    if (currentKey !== 'ignored') {
      result[currentKey] = match[2].trim();
    }
  }
  if (!result.pmi_plus && !result.pmi_minus && usedLines.length > 0) {
    result.pmi_plus = usedLines.join('\n').trim();
  }
  return result;
}

export function serializePmiMemo(value: Pick<TaskEditDraft, 'pmi_plus' | 'pmi_minus'>): string | null {
  const lines = [
    ['Plus', value.pmi_plus],
    ['Minus', value.pmi_minus],
  ]
    .map(([label, text]) => [label, text.trim()] as const)
    .filter(([, text]) => text.length > 0)
    .map(([label, text]) => `${label}: ${text}`);
  return lines.length > 0 ? lines.join('\n') : null;
}

export function taskToEditDraft(task: Task): TaskEditDraft {
  return {
    id: task.id,
    title: task.title,
    start_date: task.start_date,
    source_doc: task.source_doc ?? '',
    owner: task.owner ?? '',
    ...parsePmiMemo(task.successor_memo),
  };
}
