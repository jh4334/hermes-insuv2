import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StructureBoard, buildStructureGroups, groupChecks } from './StructureBoard';
import type { Task } from '../taskStorage';

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    description: null,
    start_date: '2026-05-11',
    end_date: null,
    category: '계획',
    job_name: null,
    group_name: '업무',
    group_color: '#2563eb',
    priority: 'normal',
    source_doc: null,
    owner: null,
    successor_memo: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const TASKS: Task[] = [
  makeTask({ id: 't1', title: '통일교육주간 운영 계획', group_name: '통일', job_name: '계기교육', category: '계획' }),
  makeTask({ id: 't2', title: '통일교육주간 물품 구입', group_name: '통일', job_name: '계기교육', category: '품의', start_date: '2026-05-20' }),
  makeTask({ id: 't3', title: '학교급식소위원회 개최', group_name: '급식', category: '심의·협의' }),
  makeTask({ id: 't4', title: '정체불명 공문', group_name: '미분류', category: null }),
];

describe('buildStructureGroups / groupChecks', () => {
  it('groups tasks by 세부업무 and keeps 미분류 first', () => {
    const groups = buildStructureGroups(TASKS);
    expect(groups[0].name).toBe('미분류');
    expect(groups.map((group) => group.name)).toEqual(['미분류', '급식', '통일']);
    expect(groups.find((group) => group.name === '통일')?.jobName).toBe('계기교육');
  });

  it('flags groups with 계획/품의 but no 결과보고', () => {
    const groups = buildStructureGroups(TASKS);
    const unified = groups.find((group) => group.name === '통일');
    expect(groupChecks(unified!).map((check) => check.message)).toContain('결과보고 미등록');
    expect(groupChecks(groups[0])).toEqual([]);
  });
});

describe('StructureBoard', () => {
  afterEach(() => cleanup());

  it('renders 업무 sections, stage lanes, the 미분류 inbox, and auto-check badges', () => {
    render(<StructureBoard tasks={TASKS} onMoveCard={vi.fn()} onRenameGroup={vi.fn()} onAssignJob={vi.fn()} />);

    expect(screen.getByLabelText(/계기교육 업무 구역/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/미분류 세부업무 레인/i)).toBeInTheDocument();
    const unifiedLane = screen.getByLabelText(/통일 세부업무 레인/i);
    expect(within(unifiedLane).getByLabelText(/통일 계획 칸 1건/i)).toBeInTheDocument();
    expect(within(unifiedLane).getByLabelText(/통일 품의 칸 1건/i)).toBeInTheDocument();
    expect(within(unifiedLane).getByText(/결과보고 미등록/i)).toBeInTheDocument();
    expect(within(screen.getByLabelText(/급식 세부업무 레인/i)).getByLabelText(/급식 심의·협의 칸 1건/i)).toBeInTheDocument();
  });

  it('drags an unclassified card into a stage cell of another 세부업무', () => {
    const onMoveCard = vi.fn();
    render(<StructureBoard tasks={TASKS} onMoveCard={onMoveCard} onRenameGroup={vi.fn()} onAssignJob={vi.fn()} />);

    fireEvent.dragStart(screen.getByRole('listitem', { name: /정체불명 공문 구조도 카드/i }));
    fireEvent.drop(screen.getByLabelText(/통일 결과보고 칸 0건/i));

    expect(onMoveCard).toHaveBeenCalledWith('t4', { group_name: '통일', category: '결과보고' });
  });

  it('renames a 세부업무 and assigns it to an 업무 bucket', () => {
    const onRenameGroup = vi.fn();
    const onAssignJob = vi.fn();
    render(<StructureBoard tasks={TASKS} onMoveCard={vi.fn()} onRenameGroup={onRenameGroup} onAssignJob={onAssignJob} />);

    fireEvent.click(screen.getByLabelText(/급식 이름 수정/i));
    const renameInput = screen.getByLabelText(/급식 세부업무 이름 수정/i);
    fireEvent.change(renameInput, { target: { value: '학교급식' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });
    expect(onRenameGroup).toHaveBeenCalledWith('급식', '학교급식');

    const jobInput = screen.getByLabelText(/급식 상위 업무 배정/i);
    fireEvent.change(jobInput, { target: { value: '급식운영' } });
    fireEvent.blur(jobInput);
    expect(onAssignJob).toHaveBeenCalledWith('급식', '급식운영');
  });

  it('creates an empty pending lane so a new 세부업무 can be made by dragging', () => {
    const onMoveCard = vi.fn();
    render(<StructureBoard tasks={TASKS} onMoveCard={onMoveCard} onRenameGroup={vi.fn()} onAssignJob={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/새 세부업무 이름/i), { target: { value: '안전교육' } });
    fireEvent.click(screen.getByRole('button', { name: /새 세부업무 추가/i }));

    const pendingLane = screen.getByLabelText(/안전교육 세부업무 레인/i);
    expect(within(pendingLane).getByText(/미분류 카드를 끌어다 놓으면 만들어져요/i)).toBeInTheDocument();

    fireEvent.dragStart(screen.getByRole('listitem', { name: /정체불명 공문 구조도 카드/i }));
    fireEvent.drop(within(pendingLane).getByLabelText(/안전교육 계획 칸 0건/i));
    expect(onMoveCard).toHaveBeenCalledWith('t4', { group_name: '안전교육', category: '계획' });

    fireEvent.click(within(pendingLane).getByLabelText(/안전교육 빈 레인 삭제/i));
    expect(screen.queryByLabelText(/안전교육 세부업무 레인/i)).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no cards', () => {
    render(<StructureBoard tasks={[]} onMoveCard={vi.fn()} onRenameGroup={vi.fn()} onAssignJob={vi.fn()} />);
    expect(screen.getByText(/구조도에 놓을 카드가 아직 없어요/i)).toBeInTheDocument();
  });
});
