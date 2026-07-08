import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildGroupHandoffDocx, buildGroupHandoffDocxModel, buildMonthlyDistribution } from './exportDocx';
import type { BundlePmiMemo, Memo, Task } from './taskStorage';

const baseTask = {
  id: 'task-plan',
  title: '통일교육 운영 계획',
  description: '업무 카드 메모',
  start_date: '2026-03-10',
  end_date: null,
  category: '계획',
  group_name: '통일교육',
  group_color: '#059669',
  priority: 'normal',
  source_doc: '업무지원과-0000',
  owner: '담당자 확인',
  reference_location: '공문함 > 통일교육',
  successor_memo: '작년에는 체험활동 일정과 겹쳐서 3월 첫째 주 Plus/Minus 메모 필요',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
} satisfies Task;

const memo: Memo = {
  id: 'memo-1',
  task_id: 'task-plan',
  content: '외부 강사 섭외는 최소 2주 전 확인',
  color: 'yellow',
  created_at: '2026-01-02T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
};

const privacyNote = '현재 로컬 업무 카드와 포스트잇형 Plus/Minus 메모에서 만든 업무묶음별 정리입니다. 원본 PDF 파일이나 원문 추출 텍스트는 포함하지 않습니다.';

const bundleMemo: BundlePmiMemo = {
  group_name: '통일교육',
  pmi_plus: '꾸러미 수준에서 좋았던 흐름',
  pmi_minus: '꾸러미 수준에서 주의할 점',
  created_at: '2026-01-03T00:00:00.000Z',
  updated_at: '2026-01-03T00:00:00.000Z',
};

function task(id: string, month: number, index: number, overrides: Partial<Task> = {}): Task {
  return {
    ...baseTask,
    id,
    title: `테스트꾸러미 업무 ${month}-${index}`,
    start_date: `2026-${String(month).padStart(2, '0')}-${String(Math.min(index + 1, 28)).padStart(2, '0')}`,
    source_doc: `샘플-${String(index).padStart(4, '0')}`,
    reference_location: '삭제되어야 할 참고자료 위치',
    ...overrides,
  };
}

describe('DOCX group handoff export', () => {
  it('builds a two-page group handoff model with bundle-level monthly distribution first and interview form second', () => {
    const tasks = [
      task('m3-1', 3, 1), task('m3-2', 3, 2),
      task('m4-1', 4, 1), task('m4-2', 4, 2), task('m4-3', 4, 3), task('m4-4', 4, 4),
      task('m5-1', 5, 1), task('m5-2', 5, 2), task('m5-3', 5, 3),
    ];
    const model = buildGroupHandoffDocxModel(tasks, [memo], [bundleMemo], '2026-07-02T00:00:00.000Z');

    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]).toMatchObject({
      name: '통일교육',
      pageOneTitle: '1쪽. 통일교육 업무지형도와 월별 업무분포표',
      pageTwoTitle: '2쪽. 통일교육 Plus/Minus 정리',
    });
    expect(model.groups[0].timeline.months.find((month) => month.month === 3)?.count).toBe(2);
    expect(model.groups[0].timeline.months.find((month) => month.month === 4)?.count).toBe(4);
    expect(model.groups[0].timeline.months.find((month) => month.month === 5)?.count).toBe(3);
    expect(model.groups[0].timeline.rows).toHaveLength(1);
    expect(model.groups[0].pmiNotes).toEqual(['Plus: 꾸러미 수준에서 좋았던 흐름\nMinus: 꾸러미 수준에서 주의할 점']);
    expect(JSON.stringify(model.groups[0])).not.toContain('이 업무는 한마디로 무엇을 챙기는 일인가요?');
    expect(JSON.stringify(model.groups[0])).not.toContain('참고자료 위치');
    expect(model.groups[0].privacyNote).toContain('원본 PDF');
  });

  it('keeps undated tasks in an 일정 미정 distribution bucket without making document-level gantt rows', () => {
    const model = buildGroupHandoffDocxModel([{ ...baseTask, start_date: '', end_date: null }], [], '2026-07-02T00:00:00.000Z');

    expect(model.groups[0].timeline.rows).toEqual([{ groupName: '통일교육', totalCount: 1, undatedCount: 1 }]);
    expect(model.groups[0].timeline.undated.count).toBe(1);
    expect(model.groups[0].timeline.months.every((month) => month.count === 0)).toBe(true);
  });

  it('builds a compact docx with one unified quadrant map, compact group sections, and no raw PDF text', async () => {
    const blob = await buildGroupHandoffDocx([
      task('m3-1', 3, 1, { group_name: '통일교육' }),
      task('m3-2', 3, 2, { group_name: '통일교육' }),
      task('m4-1', 4, 1, { group_name: '통일교육' }),
      task('m4-2', 4, 2, { group_name: '통일교육' }),
      task('m4-3', 4, 3, { group_name: '통일교육' }),
      task('m4-4', 4, 4, { group_name: '통일교육' }),
      task('m5-1', 5, 1, { group_name: '통일교육' }),
      task('safe-1', 9, 1, { group_name: '안전교육', title: '안전교육 점검' }),
      task('budget-1', 11, 1, { group_name: '예산', title: '예산 정산 안내' }),
    ], [memo], [bundleMemo], '2026-07-02T00:00:00.000Z');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const zip = await JSZip.loadAsync(bytes);
    const documentXml = await zip.file('word/document.xml')?.async('string');

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(blob.size).toBeGreaterThan(1000);
    expect(documentXml).toContain('업무묶음 DOCX Plus/Minus 정리');
    expect(documentXml).toContain('통합 업무지형도');
    expect(documentXml).toContain('전체 업무묶음 이미지형 산점도');
    expect(documentXml).toContain('지도 번호 범례');
    expect(documentXml).toContain('번호');
    expect(documentXml).toContain('업무묶음');
    expect(documentXml).toContain('가장 바쁜 때');
    expect(documentXml).toContain('상반기 분포');
    expect(documentXml).toContain('하반기 분포');
    expect(documentXml).toContain('3월');
    expect(documentXml).toContain('2건');
    expect(documentXml).toContain('4월');
    expect(documentXml).toContain('4건');
    expect(documentXml).toContain('업무 성격:');
    expect(documentXml).toContain('가장 바쁜 때: 4월 · 4건');
    expect(documentXml).not.toContain('1쪽. 통일교육 업무지형도와 월별 업무분포표');
    expect(documentXml).not.toContain('2쪽. 통일교육 Plus/Minus 정리');
    expect(documentXml).not.toContain('업무목록에서 Plus/Minus 메모를 입력하면 이 영역에 그대로 들어옵니다.');
    expect(documentXml).toContain('Plus/Minus 메모 없음');
    expect((documentXml?.match(new RegExp(privacyNote, 'g')) ?? [])).toHaveLength(1);
    expect(documentXml).not.toContain('＋');
    expect(documentXml).not.toContain('│');
    expect(documentXml).not.toContain('─');
    const mediaNames = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'));
    const svgNames = mediaNames.filter((name) => name.endsWith('.svg'));
    const pngNames = mediaNames.filter((name) => name.endsWith('.png'));
    expect(svgNames).toHaveLength(1);
    expect(pngNames).toHaveLength(1);
    const fallbackPng = await zip.file(pngNames[0])?.async('uint8array');
    expect(fallbackPng?.byteLength ?? 0).toBeGreaterThan(1000);
    const mapSvg = await zip.file(svgNames[0])?.async('string');
    expect(mapSvg).not.toContain('Y축 공문량');
    expect(mapSvg).toContain('X축 시기성');
    expect(mapSvg).not.toContain('시기 집중 ↔ 연중 지속');
    expect(mapSvg).toContain('공문 적음 ↕ 공문 많음');
    expect(mapSvg).toContain('연중 핵심 업무');
    expect(mapSvg).toContain('시기 집중 업무');
    expect(mapSvg).toContain('꾸준히 관리');
    expect(mapSvg).toContain('단발성 업무');
    expect(mapSvg).not.toContain('통일교육');
    expect(mapSvg).not.toContain('안전교육');
    expect(mapSvg).not.toContain('예산');
    expect(mapSvg).not.toContain('4월 · 4건');
    expect(documentXml).toContain('통일교육');
    expect(documentXml).toContain('안전교육');
    expect(documentXml).toContain('예산');
    expect(documentXml).toContain('4월 · 4건');
    expect(documentXml).toContain('Plus/Minus 메모 정리');
    expect(documentXml).toContain('꾸러미 수준에서 좋았던 흐름');
    expect(documentXml).toContain('꾸러미 수준에서 주의할 점');
    expect(documentXml).not.toContain('작년에는 체험활동 일정과 겹쳐서 3월 첫째 주 Plus/Minus 메모 필요');
    expect(documentXml).not.toContain('마지막으로 하고 싶은 말');
    expect(documentXml).not.toContain('이 업무는 한마디로 무엇을 챙기는 일인가요?');
    expect(documentXml).not.toContain('외부 강사 섭외는 최소 2주 전 확인');
    expect(documentXml).not.toContain('참고자료 위치');
    expect(documentXml).not.toContain('삭제되어야 할 참고자료 위치');
    expect(documentXml).not.toContain('raw_pdf');
    expect(documentXml).not.toContain('PDF 원문 본문');
  });
});

describe('buildMonthlyDistribution', () => {
  it('counts bundle tasks by month and limits representative titles', () => {
    const distribution = buildMonthlyDistribution([
      task('m3-1', 3, 1), task('m3-2', 3, 2),
      task('m4-1', 4, 1), task('m4-2', 4, 2), task('m4-3', 4, 3), task('m4-4', 4, 4), task('m4-5', 4, 5),
      { ...baseTask, id: 'undated', title: '일정 없는 업무', start_date: '' },
    ]);

    expect(distribution.months).toHaveLength(12);
    expect(distribution.months.find((month) => month.month === 3)).toMatchObject({ label: '3월', count: 2 });
    expect(distribution.months.find((month) => month.month === 4)?.count).toBe(5);
    expect(distribution.months.find((month) => month.month === 4)?.representativeTitles).toHaveLength(2);
    expect(distribution.undated).toMatchObject({ label: '일정 미정', count: 1, representativeTitles: ['일정 없는 업무'] });
  });
});
