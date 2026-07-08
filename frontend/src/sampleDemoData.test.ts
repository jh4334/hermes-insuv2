import { describe, expect, it } from 'vitest';
import { buildBundleQuadrants } from './lib/quadrant';
import { buildSampleDemoData } from './sampleDemoData';
import { normalizeStoredTasks } from './taskStorage';

describe('sample demo data', () => {
  it('builds a synthetic calendar-ready sample set without real document metadata', () => {
    const sample = buildSampleDemoData(2026);
    const tasks = normalizeStoredTasks(sample.tasks);

    expect(tasks.length).toBeGreaterThanOrEqual(10);
    expect(new Set(tasks.map((task) => task.group_name)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(tasks.map((task) => task.group_color)).size).toBeGreaterThanOrEqual(5);
    expect(tasks.every((task) => task.priority !== 'high')).toBe(true);
    expect(tasks.some((task) => task.category === '계획')).toBe(true);
    expect(tasks.some((task) => task.category === '품의')).toBe(true);
    expect(tasks.some((task) => task.category === '결과보고')).toBe(true);
    expect(tasks.some((task) => task.start_date.startsWith('2027-02'))).toBe(true);
    expect(tasks.every((task) => /^SAMPLE-[A-Z]+-\d{3}$/.test(task.source_doc ?? ''))).toBe(true);
    expect(tasks.every((task) => /^\d{4}-\d{2}-\d{2}$/.test(task.start_date))).toBe(true);
    expect(tasks.every((task) => !task.title.startsWith('가상 데이터 '))).toBe(true);
    expect(tasks.every((task) => (task.successor_memo ?? '').trim() === '')).toBe(true);
    expect(sample).toEqual(expect.objectContaining({ bundlePmiMemos: [] }));

    const quadrants = buildBundleQuadrants(tasks);
    expect(quadrants.some((item) => item.groupName === '학급운영' && item.activeMonths >= 10)).toBe(true);
    expect(quadrants.some((item) => item.quadrantLabel === '연중 핵심 업무' || item.quadrantLabel === '꾸준히 관리')).toBe(true);

    const serialized = JSON.stringify(sample);
    expect(serialized).toContain('가상 데이터');
    expect(serialized).not.toMatch(/\.pdf|업무지원과-\d+|교육지원청|초등학교|중학교|고등학교|학부모|홍길동|시범|pilot|성과|절감|\d{2,3}-\d{3,4}-\d{4}|[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/i);
  });
});
