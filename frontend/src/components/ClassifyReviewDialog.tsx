import { useMemo, useState } from 'react';
import { ArrowRightLeft, Check, Sparkles, X } from 'lucide-react';
import { UNCLASSIFIED_GROUP_NAME } from '../classify/ruleMemory';
import type { ClassifyResult } from '../classify/engine';
import type { GroupSource } from '../classify/engine';
import type { PreviewTaskInput } from '../types';
import type { Task } from '../taskStorage';

/**
 * 무더기 검토 화면(기획 문서 §4): 우르르 넣은 카드를 엔진이 "이렇게 나눴어요"라고
 * 보여주면, 사람은 묶음 이름 수정·병합·일괄 확인만 한다. 확신 낮은 카드는
 * 미분류 인박스로 가고 구조도에서 마저 정리한다.
 */

export type BucketAssignment = {
  readonly task: PreviewTaskInput;
  readonly groupName: string;
  readonly jobName: string | null;
  readonly projectName: string | null;
  readonly stage: string | null;
};

type ReviewBucket = {
  readonly id: number;
  name: string;
  jobName: string | null;
  readonly source: GroupSource;
  cardIndexes: number[];
};

const SOURCE_LABEL: Record<GroupSource, string> = {
  memory: '학습 규칙',
  cluster: '자동 묶음',
  llm: 'LLM 제안',
  unclassified: '미분류',
};

const SOURCE_TONE: Record<GroupSource, string> = {
  memory: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cluster: 'border-sky-200 bg-sky-50 text-sky-700',
  llm: 'border-violet-200 bg-violet-50 text-violet-700',
  unclassified: 'border-border bg-surface text-muted-foreground',
};

export function ClassifyReviewDialog({
  tasks,
  classification,
  existingGroups,
  onConfirm,
  onClose,
}: {
  tasks: PreviewTaskInput[];
  classification: ClassifyResult;
  existingGroups: ReadonlyArray<Pick<Task, 'group_name' | 'group_color'>>;
  onConfirm: (assignments: BucketAssignment[]) => void;
  onClose: () => void;
}) {
  const [buckets, setBuckets] = useState<ReviewBucket[]>(() =>
    classification.buckets.map((bucket, id) => ({
      id,
      name: bucket.groupName,
      jobName: bucket.jobName,
      source: bucket.source,
      cardIndexes: [...bucket.cardIndexes],
    })),
  );
  const existingGroupNames = useMemo(
    () => [...new Set(existingGroups.map((group) => group.group_name.trim()).filter(Boolean))],
    [existingGroups],
  );
  const classifiedCount = buckets.filter((bucket) => bucket.name.trim() !== UNCLASSIFIED_GROUP_NAME).reduce((sum, bucket) => sum + bucket.cardIndexes.length, 0);
  const unclassifiedCount = tasks.length - classifiedCount;

  function renameBucket(id: number, name: string) {
    setBuckets((current) => current.map((bucket) => (bucket.id === id ? { ...bucket, name } : bucket)));
  }

  function setBucketJob(id: number, jobName: string) {
    setBuckets((current) => current.map((bucket) => (bucket.id === id ? { ...bucket, jobName: jobName.trim() || null } : bucket)));
  }

  function moveCard(fromId: number, cardIndex: number, targetName: string) {
    const target = targetName.trim();
    if (!target) return;
    setBuckets((current) => {
      const withoutCard = current.map((bucket) =>
        bucket.id === fromId ? { ...bucket, cardIndexes: bucket.cardIndexes.filter((index) => index !== cardIndex) } : bucket,
      );
      const targetBucket = withoutCard.find((bucket) => bucket.name.trim() === target);
      const moved = targetBucket
        ? withoutCard.map((bucket) => (bucket.id === targetBucket.id ? { ...bucket, cardIndexes: [...bucket.cardIndexes, cardIndex] } : bucket))
        : [
            ...withoutCard,
            {
              id: Math.max(0, ...withoutCard.map((bucket) => bucket.id)) + 1,
              name: target,
              jobName: null,
              source: (target === UNCLASSIFIED_GROUP_NAME ? 'unclassified' : 'cluster') as GroupSource,
              cardIndexes: [cardIndex],
            },
          ];
      return moved.filter((bucket) => bucket.cardIndexes.length > 0);
    });
  }

  function mergeBucket(fromId: number, target: string) {
    setBuckets((current) => {
      const from = current.find((bucket) => bucket.id === fromId);
      if (!from) return current;
      const targetBucket = current.find((bucket) => bucket.id !== fromId && bucket.name.trim() === target);
      if (targetBucket) {
        return current
          .map((bucket) => (bucket.id === targetBucket.id ? { ...bucket, cardIndexes: [...bucket.cardIndexes, ...from.cardIndexes] } : bucket))
          .filter((bucket) => bucket.id !== fromId);
      }
      return current.map((bucket) => (bucket.id === fromId ? { ...bucket, name: target } : bucket));
    });
  }

  function confirmAll() {
    const assignments: BucketAssignment[] = [];
    for (const bucket of buckets) {
      const name = bucket.name.trim() || UNCLASSIFIED_GROUP_NAME;
      for (const index of bucket.cardIndexes) {
        const task = tasks[index];
        if (!task) continue;
        const card = classification.cards[index];
        assignments.push({
          task,
          groupName: name,
          jobName: bucket.jobName,
          projectName: card?.projectName ?? null,
          stage: card?.stage ?? task.category ?? null,
        });
      }
    }
    onConfirm(assignments);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col border border-border bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Sparkles className="size-4 text-ember" /> 이렇게 나눴어요</h3>
            <p className="text-xs text-muted-foreground">
              {tasks.length}건 중 {classifiedCount}건을 세부업무 후보로 묶고 {unclassifiedCount}건은 미분류로 보냈어요 · 이름을 고치거나 다른 묶음에 병합한 뒤 일괄 확인하세요
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="검토 닫기"><X className="size-5" /></button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {buckets.map((bucket) => {
            const isUnclassified = bucket.name.trim() === UNCLASSIFIED_GROUP_NAME;
            const mergeTargets = [...new Set([...buckets.filter((other) => other.id !== bucket.id).map((other) => other.name.trim()), ...existingGroupNames])].filter((name) => name && name !== bucket.name.trim());
            return (
              <section key={bucket.id} aria-label={`${bucket.name} 분류 묶음`} className={'border p-3 ' + (isUnclassified ? 'border-dashed border-border bg-background/60' : 'border-border bg-background')}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={`${bucket.name} 묶음 이름 수정`}
                    value={bucket.name}
                    onChange={(event) => renameBucket(bucket.id, event.target.value)}
                    className="w-40 border border-border bg-surface px-2 py-1.5 text-sm font-semibold text-foreground outline-none focus:border-ember"
                  />
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SOURCE_TONE[bucket.source]}`}>{SOURCE_LABEL[bucket.source]}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{bucket.cardIndexes.length}건</span>
                  {!isUnclassified ? (
                    <input
                      aria-label={`${bucket.name} 상위 업무 이름`}
                      value={bucket.jobName ?? ''}
                      onChange={(event) => setBucketJob(bucket.id, event.target.value)}
                      placeholder="상위 업무 (예: 계기교육)"
                      className="w-40 border border-border bg-surface px-2 py-1.5 text-xs text-foreground outline-none focus:border-ember"
                    />
                  ) : null}
                  {mergeTargets.length > 0 ? (
                    <label className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <ArrowRightLeft className="size-3.5" aria-hidden />
                      <select
                        aria-label={`${bucket.name} 묶음 병합 대상 선택`}
                        value=""
                        onChange={(event) => { if (event.target.value) mergeBucket(bucket.id, event.target.value); }}
                        className="border border-border bg-surface px-1.5 py-1 text-[11px] text-foreground outline-none focus:border-ember"
                      >
                        <option value="">병합…</option>
                        {mergeTargets.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </label>
                  ) : null}
                </div>
                {isUnclassified ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">확신이 낮은 카드예요. 그대로 추가한 뒤 구조도의 미분류 인박스에서 드래그로 정리할 수 있어요.</p>
                ) : null}
                <ul className="mt-2 space-y-1">
                  {bucket.cardIndexes.map((index) => {
                    const task = tasks[index];
                    const card = classification.cards[index];
                    if (!task) return null;
                    const cardMoveTargets = [
                      ...new Set([
                        ...buckets.filter((other) => other.id !== bucket.id).map((other) => other.name.trim()),
                        ...existingGroupNames,
                        UNCLASSIFIED_GROUP_NAME,
                      ]),
                    ].filter((name) => name && name !== bucket.name.trim());
                    return (
                      <li key={index} className="flex items-center gap-2 text-xs text-foreground">
                        <span className="inline-flex w-16 shrink-0 justify-center rounded-full border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{card?.stage ?? '단계미정'}</span>
                        <span className="truncate" title={task.title}>{task.title}</span>
                        {card?.projectName ? <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">{card.projectName}</span> : null}
                        {card?.isRework ? <span className="shrink-0 rounded-full border border-ember/40 bg-ember-soft px-1.5 py-0.5 text-[10px] font-semibold text-ember">보완↩</span> : null}
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{task.start_date}</span>
                        {cardMoveTargets.length > 0 ? (
                          <select
                            aria-label={`${task.title} 카드 이동 대상 선택`}
                            value=""
                            onChange={(event) => { if (event.target.value) moveCard(bucket.id, index, event.target.value); }}
                            className="shrink-0 border border-border bg-surface px-1 py-0.5 text-[11px] text-muted-foreground outline-none focus:border-ember"
                          >
                            <option value="">이동…</option>
                            {cardMoveTargets.map((name) => <option key={name} value={name}>{name}</option>)}
                          </select>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <p className="text-[11px] text-muted-foreground">확인하면 묶음 이름을 규칙으로 학습해 다음 업로드부터 자동 배치합니다</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground">취소</button>
            <button onClick={confirmAll} className="inline-flex items-center gap-1 bg-ember px-4 py-1.5 text-sm font-semibold text-ember-foreground hover:brightness-110">
              <Check className="size-4" /> {tasks.length}건 일괄 확인
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
