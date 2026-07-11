import type { BundlePmiMemo, Memo, Task } from './taskStorage';
import type { WORKFLOW_CARD_STAGES, WORKFLOW_STAGES } from './theme/tokens';

export type View = 'calendar' | 'structure' | 'archive' | 'export';

export interface NewTaskInput extends Omit<Task, 'id' | 'created_at' | 'updated_at'> {}
export type PreviewTaskInput = Omit<NewTaskInput, 'group_name' | 'group_color'>;
export type BackupImportMode = 'append' | 'replace';
export type LastUndo = { readonly label: string; readonly tasks: Task[]; readonly memos: Memo[]; readonly bundlePmiMemos: BundlePmiMemo[] };

export interface AnalysisCard {
  targetDate: string;
  sourceDate: string;
  title: string;
  sourceTitle: string;
  docNumber: string;
  owner: string;
  senderOrg?: string;
  documentType?: 'draft' | 'received' | string;
  referenceLabel: string;
  referenceLocation: string;
  stage: string;
}

export interface ExtractedFile {
  fileName: string;
  sourceDate: string;
  docNumber: string;
  title: string;
  owner: string;
  senderOrg?: string;
  documentType?: 'draft' | 'received' | string;
  department: string;
  confidence: number;
  status: string;
  evidence: string;
}

export interface ExtractResponse {
  targetYear: number;
  documentLines: string;
  extractedFiles: ExtractedFile[];
  analysis: {
    targetYear: number;
    board: { cards: AnalysisCard[]; monthLoad: Record<string, number>; peakMonths: number[] };
    workflow: { months: Array<{ month: number; label: string; totalCards: number }> };
  };
}

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];
export type WorkflowCardStage = (typeof WORKFLOW_CARD_STAGES)[number];
export type WorkflowSummary = {
  readonly groupName: string;
  readonly groupColor: string;
  readonly counts: Record<WorkflowCardStage, number>;
  readonly hasMissingResultReport: boolean;
};

export type CalendarMonth = {
  readonly year: number;
  readonly monthIndex: number;
  readonly label: string;
  readonly key: string;
};

export type MonthFlow = CalendarMonth & {
  count: number;
};

export type BundleFlow = {
  name: string;
  color: string;
  counts: Record<string, number>;
  total: number;
};

export type ArchiveQuickFilter = 'all' | 'missing-result' | 'doc-missing' | 'owner-missing';
export type TaskEditDraft = {
  readonly id: string;
  readonly title: string;
  readonly start_date: string;
  readonly source_doc: string;
  readonly owner: string;
  readonly pmi_plus: string;
  readonly pmi_minus: string;
};
