import { normalizeWorkflowCardStage } from './format';
import { normalizeTaskGroupName } from '../taskGroups';
import type { Task } from '../taskStorage';
import type { ArchiveQuickFilter } from '../types';

export type ArchiveSortMode = 'date-asc' | 'date-desc' | 'title' | 'group';

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLocaleLowerCase('ko-KR');
}

function hasText(value: string | null | undefined) {
  return normalizeText(value).length > 0;
}

export function matchesArchiveQuickFilter(task: Task, filter: ArchiveQuickFilter) {
  if (filter === 'doc-missing') return !hasText(task.source_doc);
  if (filter === 'owner-missing') return !hasText(task.owner);
  if (filter === 'missing-result') {
    return normalizeWorkflowCardStage(task.category) !== '결과보고' && /결과\s*보고/.test(task.title);
  }
  return true;
}

export function matchesArchiveSearch(task: Task, query: string) {
  const needle = normalizeText(query);
  if (!needle) return true;
  const groupName = normalizeTaskGroupName(task.group_name);
  return [task.title, task.source_doc, task.owner, groupName]
    .some((value) => normalizeText(value).includes(needle));
}

export function compareArchiveTasks(sortMode: ArchiveSortMode) {
  return (a: Task, b: Task) => {
    if (sortMode === 'date-desc') return b.start_date.localeCompare(a.start_date) || a.title.localeCompare(b.title, 'ko');
    if (sortMode === 'title') return a.title.localeCompare(b.title, 'ko') || a.start_date.localeCompare(b.start_date);
    if (sortMode === 'group') return normalizeTaskGroupName(a.group_name).localeCompare(normalizeTaskGroupName(b.group_name), 'ko') || a.start_date.localeCompare(b.start_date) || a.title.localeCompare(b.title, 'ko');
    return a.start_date.localeCompare(b.start_date) || a.title.localeCompare(b.title, 'ko');
  };
}

export function filterAndSortArchiveTasks(tasks: readonly Task[], query: string, filter: ArchiveQuickFilter, sortMode: ArchiveSortMode) {
  return tasks
    .filter((task) => matchesArchiveSearch(task, query) && matchesArchiveQuickFilter(task, filter))
    .slice()
    .sort(compareArchiveTasks(sortMode));
}
