import { buildBundleQuadrants } from './lib/quadrant';
import type { BundleQuadrant } from './lib/quadrant';
import { serializePmiMemo } from './lib/format';
import { normalizeTaskGroupName } from './taskGroups';
import type { BundlePmiMemo, Memo, Task } from './taskStorage';

export const GROUP_HANDOFF_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const UNCATEGORIZED_GROUP_NAME = '미분류';
const KOREAN_FONT = 'Malgun Gothic';
const PRIVACY_NOTE = '현재 로컬 업무 카드와 포스트잇형 Plus/Minus 메모에서 만든 업무묶음별 정리입니다. 원본 PDF 파일이나 원문 추출 텍스트는 포함하지 않습니다.';
const REPRESENTATIVE_TITLE_LIMIT = 2;

const MONTHS = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, label: `${index + 1}월` }));

type DocxModule = typeof import('docx');
type DocxChild = InstanceType<DocxModule['Paragraph']> | InstanceType<DocxModule['Table']>;
type AlignmentValue = (typeof import('docx').AlignmentType)[keyof typeof import('docx').AlignmentType];
type HeadingValue = (typeof import('docx').HeadingLevel)[keyof typeof import('docx').HeadingLevel];

export type MonthlyDistributionCell = {
  readonly month: number | null;
  readonly label: string;
  readonly count: number;
  readonly representativeTitles: readonly string[];
  readonly stages: readonly string[];
};

export type TimelineRow = {
  readonly groupName: string;
  readonly totalCount: number;
  readonly undatedCount: number;
};

export type TimelineModel = {
  readonly months: readonly MonthlyDistributionCell[];
  readonly undated: MonthlyDistributionCell;
  readonly rows: readonly TimelineRow[];
};

export type GroupHandoffDocxGroup = {
  readonly name: string;
  readonly pageOneTitle: string;
  readonly pageTwoTitle: string;
  readonly privacyNote: string;
  readonly timeline: TimelineModel;
  readonly quadrantLabel: string;
  readonly busiestMonthLabel: string;
  readonly pmiNotes: readonly string[];
};

export type UnifiedQuadrantItem = BundleQuadrant & {
  readonly busiestMonthLabel: string;
};

export type GroupHandoffDocxModel = {
  readonly exportedAt: string;
  readonly privacyNote: string;
  readonly groups: readonly GroupHandoffDocxGroup[];
  readonly quadrants: readonly UnifiedQuadrantItem[];
};

type DateParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

function parseDateParts(value?: string | null): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function compareDateParts(a: DateParts, b: DateParts): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

function normalizedGroupName(task: Task): string {
  return task.group_name.trim() || UNCATEGORIZED_GROUP_NAME;
}

function sortTaskItems(a: Task, b: Task): number {
  const aDate = parseDateParts(a.start_date);
  const bDate = parseDateParts(b.start_date);
  if (aDate && bDate) return compareDateParts(aDate, bDate) || a.title.localeCompare(b.title, 'ko');
  if (aDate) return -1;
  if (bDate) return 1;
  return a.title.localeCompare(b.title, 'ko');
}

function valueOrFallback(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : fallback;
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function pmiNotesForGroup(_tasks: readonly Task[], bundleMemo: BundlePmiMemo | null): string[] {
  const bundleText = bundleMemo ? serializePmiMemo({ pmi_plus: bundleMemo.pmi_plus, pmi_minus: bundleMemo.pmi_minus }) : null;
  return bundleText ? [bundleText] : [];
}

function dateLabel(value?: string | null): string {
  return parseDateParts(value) ? value ?? '' : '일정 미정';
}

export function buildMonthlyDistribution(tasks: readonly Task[]): TimelineModel {
  const sortedTasks = tasks.slice().sort(sortTaskItems);
  const byMonth = new Map<number, Task[]>();
  const undatedTasks: Task[] = [];

  for (const task of sortedTasks) {
    const date = parseDateParts(task.start_date);
    if (!date) {
      undatedTasks.push(task);
      continue;
    }
    byMonth.set(date.month, [...(byMonth.get(date.month) ?? []), task]);
  }

  const months = MONTHS.map(({ month, label }) => {
    const monthlyTasks = byMonth.get(month) ?? [];
    return {
      month,
      label,
      count: monthlyTasks.length,
      representativeTitles: monthlyTasks.slice(0, REPRESENTATIVE_TITLE_LIMIT).map((task) => task.title),
      stages: uniqueNonEmpty(monthlyTasks.map((task) => valueOrFallback(task.category, '업무'))),
    };
  });

  return {
    months,
    undated: {
      month: null,
      label: '일정 미정',
      count: undatedTasks.length,
      representativeTitles: undatedTasks.slice(0, REPRESENTATIVE_TITLE_LIMIT).map((task) => task.title),
      stages: uniqueNonEmpty(undatedTasks.map((task) => valueOrFallback(task.category, '업무'))),
    },
    rows: [{
      groupName: normalizedGroupName(sortedTasks[0] ?? ({ group_name: UNCATEGORIZED_GROUP_NAME } as Task)),
      totalCount: sortedTasks.length,
      undatedCount: undatedTasks.length,
    }],
  };
}

function busiestMonthLabel(timeline: TimelineModel): string {
  const busiest = timeline.months
    .filter((month) => month.count > 0)
    .sort((a, b) => b.count - a.count || (a.month ?? 0) - (b.month ?? 0))[0];
  return busiest ? `${busiest.label} · ${busiest.count}건` : '일정 미정';
}

export function buildGroupHandoffDocxModel(
  tasks: readonly Task[],
  memos: readonly Memo[],
  bundlePmiMemosOrExportedAt: readonly BundlePmiMemo[] | string = [],
  exportedAt = new Date().toISOString(),
): GroupHandoffDocxModel {
  const bundlePmiMemos = Array.isArray(bundlePmiMemosOrExportedAt) ? bundlePmiMemosOrExportedAt : [];
  const exportDate = typeof bundlePmiMemosOrExportedAt === 'string' ? bundlePmiMemosOrExportedAt : exportedAt;
  void memos;
  const groupMap = new Map<string, Task[]>();
  for (const task of tasks) {
    const groupName = normalizedGroupName(task);
    groupMap.set(groupName, [...(groupMap.get(groupName) ?? []), task]);
  }

  const allQuadrants = buildBundleQuadrants(tasks);
  const quadrantByGroup = new Map(allQuadrants.map((quadrant) => [quadrant.groupName, quadrant]));

  const groups = Array.from(groupMap.entries())
    .map(([name, groupedTasks]) => ({
      name,
      tasks: groupedTasks.slice().sort(sortTaskItems),
    }))
    .sort((a, b) => {
      if (a.name === UNCATEGORIZED_GROUP_NAME) return 1;
      if (b.name === UNCATEGORIZED_GROUP_NAME) return -1;
      return sortTaskItems(a.tasks[0], b.tasks[0]) || a.name.localeCompare(b.name, 'ko');
    })
    .map(({ name, tasks: groupedTasks }) => {
      const timeline = buildMonthlyDistribution(groupedTasks);
      const quadrant = quadrantByGroup.get(name);
      const bundleMemo = bundlePmiMemos.find((memo) => normalizeTaskGroupName(memo.group_name) === name) ?? null;
      return {
        name,
        pageOneTitle: `1쪽. ${name} 업무지형도와 월별 업무분포표`,
        pageTwoTitle: `2쪽. ${name} Plus/Minus 정리`,
        privacyNote: PRIVACY_NOTE,
        timeline,
        quadrantLabel: quadrant?.quadrantLabel ?? '업무 성격 미정',
        busiestMonthLabel: busiestMonthLabel(timeline),
        pmiNotes: pmiNotesForGroup(groupedTasks, bundleMemo),
      };
    });

  return {
    exportedAt: exportDate,
    privacyNote: PRIVACY_NOTE,
    groups,
    quadrants: allQuadrants.map((quadrant) => {
      const group = groups.find((item) => item.name === quadrant.groupName);
      return {
        ...quadrant,
        busiestMonthLabel: group?.busiestMonthLabel ?? '일정 미정',
      };
    }),
  };
}

function run(docx: DocxModule, text: string, options: { readonly bold?: boolean; readonly color?: string; readonly size?: number } = {}) {
  return new docx.TextRun({
    text,
    bold: options.bold,
    color: options.color,
    size: options.size ?? 20,
    font: KOREAN_FONT,
  });
}

function paragraph(docx: DocxModule, text: string, options: { readonly bold?: boolean; readonly color?: string; readonly heading?: HeadingValue; readonly size?: number } = {}) {
  return new docx.Paragraph({
    heading: options.heading,
    spacing: { after: 160 },
    children: [run(docx, text, options)],
  });
}

function pageBreak(docx: DocxModule) {
  return new docx.Paragraph({ pageBreakBefore: true, children: [] });
}

function cell(
  docx: DocxModule,
  text: string,
  options: { readonly bold?: boolean; readonly fill?: string; readonly width?: number; readonly widthDxa?: number; readonly align?: AlignmentValue } = {},
) {
  return new docx.TableCell({
    width: options.widthDxa
      ? { size: options.widthDxa, type: docx.WidthType.DXA }
      : options.width
        ? { size: options.width, type: docx.WidthType.PERCENTAGE }
        : undefined,
    shading: options.fill ? { fill: options.fill, type: docx.ShadingType.CLEAR } : undefined,
    verticalAlign: docx.VerticalAlignTable.CENTER,
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
    children: text.split('\n').map((line) => new docx.Paragraph({
      alignment: options.align,
      spacing: { after: 60 },
      children: [run(docx, line || ' ', { bold: options.bold, size: 17 })],
    })),
  });
}

function headerCell(docx: DocxModule, text: string, width?: number, widthDxa?: number) {
  return cell(docx, text, { bold: true, fill: 'E2E8F0', width, widthDxa, align: docx.AlignmentType.CENTER });
}

function monthCellText(month: MonthlyDistributionCell): string {
  if (month.count === 0) return '-';
  const stageText = month.stages.length > 0 ? month.stages.join('·') : '업무';
  const titles = month.representativeTitles.length > 0 ? `\n${month.representativeTitles.join('\n')}` : '';
  return `${month.count}건 · ${stageText}${titles}`;
}

function monthFill(count: number): string | undefined {
  if (count >= 4) return 'BBF7D0';
  if (count >= 2) return 'DCFCE7';
  if (count === 1) return 'F0FDF4';
  return undefined;
}

function buildHalfYearDistributionTable(
  docx: DocxModule,
  title: string,
  groupName: string,
  months: readonly MonthlyDistributionCell[],
) {
  const groupWidthDxa = 1720;
  const monthWidthDxa = Math.floor((10000 - groupWidthDxa) / Math.max(months.length, 1));
  return new docx.Table({
    width: { size: 10000, type: docx.WidthType.DXA },
    columnWidths: [groupWidthDxa, ...months.map(() => monthWidthDxa)],
    layout: docx.TableLayoutType.FIXED,
    rows: [
      new docx.TableRow({
        tableHeader: true,
        children: [headerCell(docx, title, undefined, groupWidthDxa), ...months.map((month) => headerCell(docx, month.label, undefined, monthWidthDxa))],
      }),
      new docx.TableRow({
        children: [
          cell(docx, groupName, { bold: true, widthDxa: groupWidthDxa, align: docx.AlignmentType.CENTER }),
          ...months.map((month) => cell(docx, monthCellText(month), {
            widthDxa: monthWidthDxa,
            fill: monthFill(month.count),
            align: docx.AlignmentType.CENTER,
          })),
        ],
      }),
    ],
  });
}

function buildDistributionTables(docx: DocxModule, group: GroupHandoffDocxGroup): DocxChild[] {
  const firstHalf = group.timeline.months.slice(0, 6);
  const secondHalf = group.timeline.months.slice(6, 12);
  const undatedText = group.timeline.undated.count > 0
    ? `일정 미정: ${group.timeline.undated.count}건 · ${group.timeline.undated.representativeTitles.join(', ')}`
    : '일정 미정 업무 없음';

  return [
    paragraph(docx, '상반기 분포', { bold: true, color: '334155' }),
    buildHalfYearDistributionTable(docx, '업무묶음', group.name, firstHalf),
    paragraph(docx, '하반기 분포', { bold: true, color: '334155' }),
    buildHalfYearDistributionTable(docx, '업무묶음', group.name, secondHalf),
    paragraph(docx, undatedText, { color: '64748B', size: 18 }),
    paragraph(docx, '각 월의 건수는 이 업무묶음 안 공문들이 어느 달에 몰리는지 보여줍니다. 공문 건별 1회성 막대가 아니라 업무묶음의 연간 분포를 보는 표입니다.', { color: '64748B', size: 18 }),
  ];
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  bytes.forEach((byte) => {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  });
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes);
  crcInput.set(data, typeBytes.length);
  view.setUint32(8 + data.length, crc32(crcInput), false);
  return chunk;
}

function zlibStore(bytes: Uint8Array): Uint8Array {
  const parts: number[] = [0x78, 0x01];
  for (let offset = 0; offset < bytes.length;) {
    const length = Math.min(65535, bytes.length - offset);
    const finalBlock = offset + length >= bytes.length;
    parts.push(finalBlock ? 0x01 : 0x00, length & 0xff, (length >>> 8) & 0xff, (~length) & 0xff, ((~length) >>> 8) & 0xff);
    for (let index = 0; index < length; index += 1) parts.push(bytes[offset + index]);
    offset += length;
  }
  const checksum = adler32(bytes);
  parts.push((checksum >>> 24) & 0xff, (checksum >>> 16) & 0xff, (checksum >>> 8) & 0xff, checksum & 0xff);
  return Uint8Array.from(parts);
}

function rgbaFallbackPng(items: readonly UnifiedQuadrantItem[]): Uint8Array {
  const width = 620;
  const height = 350;
  const pixels = new Uint8Array(width * height * 4);
  const setPixel = (x: number, y: number, color: readonly [number, number, number, number]) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = (y * width + x) * 4;
    pixels[index] = color[0];
    pixels[index + 1] = color[1];
    pixels[index + 2] = color[2];
    pixels[index + 3] = color[3];
  };
  const fillRect = (x: number, y: number, w: number, h: number, color: readonly [number, number, number, number]) => {
    for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy += 1) {
      for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx += 1) setPixel(xx, yy, color);
    }
  };
  const fillCircle = (cx: number, cy: number, radius: number, color: readonly [number, number, number, number]) => {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) setPixel(x, y, color);
      }
    }
  };
  fillRect(0, 0, width, height, [255, 250, 240, 255]);
  fillRect(60, 45, 250, 120, [254, 226, 226, 255]);
  fillRect(310, 45, 250, 120, [255, 237, 213, 255]);
  fillRect(60, 165, 250, 120, [224, 242, 254, 255]);
  fillRect(310, 165, 250, 120, [220, 252, 231, 255]);
  fillRect(306, 45, 7, 240, [124, 111, 88, 255]);
  fillRect(60, 162, 500, 7, [124, 111, 88, 255]);
  const segments: Record<string, readonly string[]> = {
    '0': ['abcdef'],
    '1': ['bc'],
    '2': ['abged'],
    '3': ['abgcd'],
    '4': ['fgbc'],
    '5': ['afgcd'],
    '6': ['afgecd'],
    '7': ['abc'],
    '8': ['abcdefg'],
    '9': ['abfgcd'],
  };
  const drawDigit = (digit: string, x: number, y: number, color: readonly [number, number, number, number]) => {
    const active = segments[digit]?.[0] ?? '';
    const draw = (segment: string, rx: number, ry: number, rw: number, rh: number) => {
      if (active.includes(segment)) fillRect(x + rx, y + ry, rw, rh, color);
    };
    draw('a', 2, 0, 10, 2);
    draw('b', 12, 2, 2, 9);
    draw('c', 12, 13, 2, 9);
    draw('d', 2, 22, 10, 2);
    draw('e', 0, 13, 2, 9);
    draw('f', 0, 2, 2, 9);
    draw('g', 2, 11, 10, 2);
  };
  const drawCompactDigit = (digit: string, x: number, y: number, color: readonly [number, number, number, number]) => {
    const active = segments[digit]?.[0] ?? '';
    const draw = (segment: string, rx: number, ry: number, rw: number, rh: number) => {
      if (active.includes(segment)) fillRect(x + rx, y + ry, rw, rh, color);
    };
    draw('a', 1, 0, 6, 2);
    draw('b', 7, 2, 2, 5);
    draw('c', 7, 8, 2, 5);
    draw('d', 1, 13, 6, 2);
    draw('e', 0, 8, 2, 5);
    draw('f', 0, 2, 2, 5);
    draw('g', 1, 6, 6, 2);
  };
  const drawMarkerNumber = (number: number, centerX: number, centerY: number) => {
    const color: readonly [number, number, number, number] = [255, 255, 255, 255];
    const label = String(number);
    if (label.length === 1) {
      drawDigit(label, centerX - 7, centerY - 12, color);
      return;
    }
    const digitWidth = 9;
    const gap = 1;
    const totalWidth = label.length * digitWidth + (label.length - 1) * gap;
    let x = Math.round(centerX - totalWidth / 2);
    for (const digit of label) {
      drawCompactDigit(digit, x, centerY - 7, color);
      x += digitWidth + gap;
    }
  };
  items.forEach((item, index) => {
    const marker = unifiedMarkerPosition(item);
    const markerX = Math.round((marker.x / 920) * width);
    const markerY = Math.round((marker.y / 520) * height);
    fillCircle(markerX, markerY, 14, [185, 28, 28, 255]);
    fillCircle(markerX, markerY, 11, [255, 247, 237, 255]);
    fillCircle(markerX, markerY, 9, [185, 28, 28, 255]);
    drawMarkerNumber(index + 1, markerX, markerY);
  });

  const rows = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    rows[rowStart] = 0;
    rows.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [pngChunk('IHDR', ihdr), pngChunk('IDAT', zlibStore(rows)), pngChunk('IEND', new Uint8Array())];
  const total = signature.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  png.set(signature, offset);
  offset += signature.length;
  chunks.forEach((chunk) => {
    png.set(chunk, offset);
    offset += chunk.length;
  });
  return png;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${bytesToBase64(new TextEncoder().encode(svg))}`;
}

function pngDataUri(bytes: Uint8Array): string {
  return `data:image/png;base64,${bytesToBase64(bytes)}`;
}

function unifiedMarkerPosition(item: UnifiedQuadrantItem): { readonly x: number; readonly y: number } {
  return {
    x: 96 + (item.xPercent / 100) * 720,
    y: 424 - (item.yPercent / 100) * 360,
  };
}

function unifiedQuadrantMapSvg(items: readonly UnifiedQuadrantItem[]): string {
  const markers = items.map((item, index) => {
    const marker = unifiedMarkerPosition(item);
    const color = escapeXml(item.groupColor || '#b91c1c');
    return `
  <g>
    <circle cx="${marker.x.toFixed(1)}" cy="${marker.y.toFixed(1)}" r="21" fill="${color}" stroke="#7f1d1d" stroke-width="3"/>
    <circle cx="${marker.x.toFixed(1)}" cy="${marker.y.toFixed(1)}" r="15" fill="#fff7ed" opacity="0.18"/>
    <text x="${marker.x.toFixed(1)}" y="${(marker.y + 8).toFixed(1)}" text-anchor="middle" font-family="Arial, Malgun Gothic, Apple SD Gothic Neo, sans-serif" font-size="24" font-weight="900" fill="#ffffff">${index + 1}</text>
  </g>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="920" height="520" viewBox="0 0 920 520" role="img" aria-label="전체 업무묶음 이미지형 산점도">
  <rect x="0" y="0" width="920" height="520" rx="26" fill="#fffaf0"/>
  <rect x="96" y="64" width="720" height="360" rx="22" fill="#f8fafc" stroke="#d6c7aa" stroke-width="3"/>
  <rect x="96" y="64" width="360" height="180" rx="20" fill="#fee2e2" opacity="0.66"/>
  <rect x="456" y="64" width="360" height="180" rx="20" fill="#ffedd5" opacity="0.78"/>
  <rect x="96" y="244" width="360" height="180" rx="20" fill="#e0f2fe" opacity="0.74"/>
  <rect x="456" y="244" width="360" height="180" rx="20" fill="#dcfce7" opacity="0.74"/>
  <line x1="456" y1="76" x2="456" y2="412" stroke="#7c6f58" stroke-width="4" stroke-dasharray="10 9"/>
  <line x1="110" y1="244" x2="802" y2="244" stroke="#7c6f58" stroke-width="4" stroke-dasharray="10 9"/>
  <circle cx="456" cy="244" r="9" fill="#7f1d1d"/>

  <text x="34" y="250" text-anchor="middle" transform="rotate(-90 34 250)" font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif" font-size="22" font-weight="700" fill="#475569">공문 적음 ↕ 공문 많음</text>
  <text x="456" y="488" text-anchor="middle" font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif" font-size="24" font-weight="700" fill="#334155">시기 집중 ←──── X축 시기성 ────→ 연중 지속</text>

${markers}

  <rect x="120" y="28" width="176" height="32" rx="10" fill="#fffaf0" opacity="0.92"/>
  <rect x="500" y="28" width="184" height="32" rx="10" fill="#fffaf0" opacity="0.92"/>
  <rect x="120" y="430" width="142" height="32" rx="10" fill="#fffaf0" opacity="0.92"/>
  <rect x="516" y="430" width="152" height="32" rx="10" fill="#fffaf0" opacity="0.92"/>
  <text x="136" y="52" font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif" font-size="21" font-weight="700" fill="#991b1b">시기 집중 업무</text>
  <text x="592" y="52" text-anchor="middle" font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif" font-size="21" font-weight="700" fill="#9a3412">연중 핵심 업무</text>
  <text x="136" y="454" font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif" font-size="21" font-weight="700" fill="#075985">단발성 업무</text>
  <text x="592" y="454" text-anchor="middle" font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif" font-size="21" font-weight="700" fill="#166534">꾸준히 관리</text>
</svg>`;
}

function buildUnifiedQuadrantMapImage(docx: DocxModule, items: readonly UnifiedQuadrantItem[]) {
  const svg = unifiedQuadrantMapSvg(items);
  return new docx.Paragraph({
    alignment: docx.AlignmentType.CENTER,
    spacing: { after: 220 },
    children: [
      new docx.ImageRun({
        type: 'svg',
        data: svgDataUri(svg),
        fallback: {
          type: 'png',
          data: pngDataUri(rgbaFallbackPng(items)),
        },
        transformation: { width: 620, height: 350 },
        altText: {
          title: '전체 업무묶음 이미지형 산점도',
          description: '모든 업무묶음의 업무 성격과 공문량을 한 지도에 함께 배치한 통합 업무지형도',
          name: '통합 업무지형도',
        },
      }),
    ],
  });
}

function buildPmiNotesChildren(docx: DocxModule, notes: readonly string[]): DocxChild[] {
  if (notes.length === 0) return [paragraph(docx, 'Plus/Minus 메모 없음', { color: '64748B', size: 18 })];
  const rows = notes.map((note, index) => new docx.TableRow({ children: [cell(docx, String(index + 1), { bold: true, width: 10, align: docx.AlignmentType.CENTER }), cell(docx, note, { width: 90 })] }));
  return [new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    layout: docx.TableLayoutType.FIXED,
    rows: [new docx.TableRow({ tableHeader: true, children: [headerCell(docx, '번호', 10), headerCell(docx, '업무목록 Plus/Minus 메모', 90)] }), ...rows],
  })];
}

function groupChildren(docx: DocxModule, group: GroupHandoffDocxGroup, includeTrailingBreak: boolean): DocxChild[] {
  return [
    paragraph(docx, group.name, { heading: docx.HeadingLevel.HEADING_1, bold: true, size: 30 }),
    paragraph(docx, `업무 성격: ${group.quadrantLabel} · 가장 바쁜 때: ${group.busiestMonthLabel}`, { bold: true, color: '334155' }),
    paragraph(docx, '월별 업무분포표: 업무묶음 안 공문들의 월별 분포', { bold: true, color: '334155' }),
    ...buildDistributionTables(docx, group),
    paragraph(docx, 'Plus/Minus 메모 정리: 업무목록에 직접 적은 Plus/Minus 메모만 그대로 모았습니다.', { bold: true, color: '334155' }),
    ...buildPmiNotesChildren(docx, group.pmiNotes),
    ...(includeTrailingBreak ? [pageBreak(docx)] : []),
  ];
}

function legendCell(
  docx: DocxModule,
  text: string,
  options: { readonly bold?: boolean; readonly fill?: string; readonly widthDxa?: number; readonly align?: AlignmentValue } = {},
) {
  return new docx.TableCell({
    width: options.widthDxa ? { size: options.widthDxa, type: docx.WidthType.DXA } : undefined,
    shading: options.fill ? { fill: options.fill, type: docx.ShadingType.CLEAR } : undefined,
    verticalAlign: docx.VerticalAlignTable.CENTER,
    margins: { top: 70, bottom: 70, left: 80, right: 80 },
    children: text.split('\n').map((line) => new docx.Paragraph({
      alignment: options.align,
      spacing: { after: 30 },
      children: [run(docx, line || ' ', { bold: options.bold, size: 15 })],
    })),
  });
}

function legendHeaderCell(docx: DocxModule, text: string, widthDxa?: number) {
  return legendCell(docx, text, { bold: true, fill: 'E2E8F0', widthDxa, align: docx.AlignmentType.CENTER });
}

function buildQuadrantLegendTable(docx: DocxModule, items: readonly UnifiedQuadrantItem[]): DocxChild[] {
  if (items.length === 0) return [];
  return [
    paragraph(docx, '지도 번호 범례', { bold: true, color: '334155' }),
    new docx.Table({
      width: { size: 10000, type: docx.WidthType.DXA },
      columnWidths: [900, 3100, 6000],
      layout: docx.TableLayoutType.FIXED,
      rows: [
        new docx.TableRow({
          tableHeader: true,
          children: [legendHeaderCell(docx, '번호', 900), legendHeaderCell(docx, '업무묶음', 3100), legendHeaderCell(docx, '업무 성격 / 가장 바쁜 때', 6000)],
        }),
        ...items.map((item, index) => new docx.TableRow({
          children: [
            legendCell(docx, String(index + 1), { bold: true, widthDxa: 900, align: docx.AlignmentType.CENTER }),
            legendCell(docx, item.groupName, { widthDxa: 3100 }),
            legendCell(docx, `${item.quadrantLabel}\n${item.busiestMonthLabel}`, { widthDxa: 6000 }),
          ],
        })),
      ],
    }),
  ];
}

function buildDocxDocument(docx: DocxModule, model: GroupHandoffDocxModel) {
  const introChildren: DocxChild[] = model.groups.length > 0 ? [
    paragraph(docx, '업무묶음 DOCX Plus/Minus 정리', { heading: docx.HeadingLevel.HEADING_1, bold: true, size: 32 }),
    paragraph(docx, model.privacyNote, { color: '64748B', size: 18 }),
    paragraph(docx, '통합 업무지형도', { heading: docx.HeadingLevel.HEADING_2, bold: true, size: 28 }),
    paragraph(docx, '전체 업무묶음 이미지형 산점도', { bold: true, color: '334155' }),
    paragraph(docx, '모든 업무묶음을 한 지도에 함께 배치해 업무 성격과 바쁜 시기를 비교합니다.', { color: '64748B', size: 18 }),
    buildUnifiedQuadrantMapImage(docx, model.quadrants),
    ...buildQuadrantLegendTable(docx, model.quadrants),
    pageBreak(docx),
  ] : [];
  const children = [...introChildren, ...model.groups.flatMap((group, index) => groupChildren(docx, group, index < model.groups.length - 1))];
  return new docx.Document({
    title: '업무묶음 DOCX Plus/Minus 정리',
    subject: '올해 업무 실행판',
    creator: '모두의 인수인계',
    description: model.privacyNote,
    sections: [{
      properties: {
        page: {
          margin: { top: 900, right: 720, bottom: 900, left: 720 },
        },
      },
      children: children.length > 0 ? children : [
        paragraph(docx, '업무묶음 DOCX Plus/Minus 정리', { heading: docx.HeadingLevel.HEADING_1, bold: true, size: 32 }),
        paragraph(docx, '내보낼 업무묶음이 없습니다.', { color: '64748B' }),
        paragraph(docx, model.privacyNote, { color: '64748B', size: 18 }),
      ],
    }],
  });
}

export async function buildGroupHandoffDocx(
  tasks: readonly Task[],
  memos: readonly Memo[],
  bundlePmiMemosOrExportedAt: readonly BundlePmiMemo[] | string = [],
  exportedAt = new Date().toISOString(),
): Promise<Blob> {
  const docx = await import('docx');
  const model = buildGroupHandoffDocxModel(tasks, memos, bundlePmiMemosOrExportedAt, exportedAt);
  const packed = await docx.Packer.toBlob(buildDocxDocument(docx, model));
  return new Blob([packed], { type: GROUP_HANDOFF_DOCX_MIME });
}
