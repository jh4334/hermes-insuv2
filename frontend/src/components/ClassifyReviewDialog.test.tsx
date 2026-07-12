import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyCards } from '../classify/engine';
import { ClassifyReviewDialog } from './ClassifyReviewDialog';
import type { BucketAssignment } from './ClassifyReviewDialog';
import type { PreviewTaskInput } from '../types';

function makePreviewTask(title: string, startDate: string): PreviewTaskInput {
  return {
    title,
    description: null,
    start_date: startDate,
    end_date: null,
    category: '계획',
    priority: 'normal',
    source_doc: null,
    owner: null,
    reference_location: null,
    successor_memo: null,
  };
}

const TASKS = [
  makePreviewTask('통일교육주간 운영 계획', '2026-05-01'),
  makePreviewTask('통일교육주간 결과 정리', '2026-05-20'),
  makePreviewTask('정체불명 문서', '2026-06-01'),
];

describe('ClassifyReviewDialog', () => {
  afterEach(() => cleanup());

  function renderDialog(onConfirm = vi.fn<(assignments: BucketAssignment[]) => void>()) {
    const classification = classifyCards(TASKS.map((task) => ({ title: task.title, category: task.category })));
    render(
      <ClassifyReviewDialog
        tasks={TASKS}
        classification={classification}
        existingGroups={[{ group_name: '교육과정', group_color: '#2563eb' }]}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    return onConfirm;
  }

  it('moves a single card to another bucket without merging the whole bucket', () => {
    const onConfirm = renderDialog();

    const clusterBucket = screen.getByLabelText(/통일교육주간 분류 묶음/i);
    fireEvent.change(within(clusterBucket).getByLabelText(/통일교육주간 결과 정리 카드 이동 대상 선택/i), { target: { value: '미분류' } });

    const inbox = screen.getByLabelText(/미분류 분류 묶음/i);
    expect(within(inbox).getByText(/통일교육주간 결과 정리/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /3건 일괄 확인/i }));
    const assignments = onConfirm.mock.calls[0][0];
    expect(assignments.find((entry) => entry.task.title === '통일교육주간 결과 정리')?.groupName).toBe('미분류');
    expect(assignments.find((entry) => entry.task.title === '통일교육주간 운영 계획')?.groupName).toBe('통일교육주간');
  });

  it('moves a card to an existing group, creating the bucket on demand and dropping emptied buckets', () => {
    renderDialog();

    const inbox = screen.getByLabelText(/미분류 분류 묶음/i);
    fireEvent.change(within(inbox).getByLabelText(/정체불명 문서 카드 이동 대상 선택/i), { target: { value: '교육과정' } });

    expect(screen.queryByLabelText(/미분류 분류 묶음/i)).not.toBeInTheDocument();
    const created = screen.getByLabelText(/교육과정 분류 묶음/i);
    expect(within(created).getByText(/정체불명 문서/i)).toBeInTheDocument();
  });
});
