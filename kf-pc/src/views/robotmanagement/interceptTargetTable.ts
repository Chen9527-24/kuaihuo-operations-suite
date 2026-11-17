import ExcelJS from 'exceljs';
import type { InterceptTargetEntry } from './types';

export type InterceptTargetImportRow = Pick<InterceptTargetEntry, 'url' | 'accountName' | 'enabled'>;

const HEADERS = ['账号名称', '链接', '是否启用'];
const TEMPLATE_ROWS: InterceptTargetImportRow[] = [
  { accountName: '竞品账号A', url: 'https://www.douyin.com/user/xxxx', enabled: true },
  { accountName: '热门作品B', url: 'https://www.douyin.com/video/1234567890', enabled: true }
];

export async function parseInterceptTargetExcel(file: File): Promise<InterceptTargetImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRowNumber = findHeaderRow(worksheet);
  const headerMap = buildHeaderMap(worksheet.getRow(headerRowNumber));
  const accountCol = findCol(headerMap, '账号名称', '账号名', '名称', '备注名', '标签');
  const urlCol = findCol(headerMap, '链接', '主页链接', '作品链接', 'url', 'URL');
  const enabledCol = findCol(headerMap, '是否启用', '启用', 'enabled', 'Enabled');
  if (!urlCol) return [];

  const rows: InterceptTargetImportRow[] = [];
  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const url = getCellText(row.getCell(urlCol));
    if (!url) continue;
    const accountName = accountCol ? getCellText(row.getCell(accountCol)) : '';
    const enabled = enabledCol ? normalizeEnabled(getCellText(row.getCell(enabledCol))) : true;
    rows.push({ url, accountName, enabled });
  }
  return rows;
}

export async function downloadInterceptTargetTemplate(modeLabel: string) {
  const rows = TEMPLATE_ROWS.map((item, index) => ({
    ...item,
    url: modeLabel.includes('作品') && index === 0 ? 'https://www.douyin.com/video/1234567890' : item.url
  }));
  await writeTargetWorkbook(rows, `截流监听导入模板_${modeLabel}.xlsx`);
}

export async function exportInterceptTargets(rows: InterceptTargetEntry[], modeLabel: string) {
  const normalized = rows.map((item) => ({
    accountName: item.accountName || item.label || '',
    url: item.url,
    enabled: item.enabled !== false
  }));
  await writeTargetWorkbook(normalized, `截流监听_${modeLabel}_${formatDate()}.xlsx`);
}

async function writeTargetWorkbook(rows: InterceptTargetImportRow[], filename: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('监听列表');
  sheet.addRow(HEADERS);
  rows.forEach((item) => {
    sheet.addRow([item.accountName || '', item.url || '', item.enabled === false ? '否' : '是']);
  });
  sheet.columns = [
    { width: 22 },
    { width: 72 },
    { width: 14 }
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle' };
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, filename);
}

function findHeaderRow(worksheet: ExcelJS.Worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(10, worksheet.rowCount || 10); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const headerMap = buildHeaderMap(row);
    if (findCol(headerMap, '链接', '主页链接', '作品链接', 'url', 'URL')) return rowNumber;
  }
  return 1;
}

function buildHeaderMap(row: ExcelJS.Row) {
  const map = new Map<string, number>();
  row.eachCell((cell, colNumber) => {
    const text = getCellText(cell).replace(/\s+/g, '');
    if (text) map.set(text, colNumber);
  });
  return map;
}

function findCol(map: Map<string, number>, ...names: string[]) {
  for (const name of names) {
    const direct = map.get(name.replace(/\s+/g, ''));
    if (direct) return direct;
  }
  const lowerNames = names.map((item) => item.toLowerCase());
  for (const [key, value] of map.entries()) {
    const lower = key.toLowerCase();
    if (lowerNames.some((name) => lower.includes(name))) return value;
  }
  return 0;
}

function getCellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim();
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((item) => String(item.text ?? '')).join('').trim();
  }
  if (typeof value === 'object' && 'result' in value && value.result != null) return String(value.result).trim();
  return String(value).trim();
}

function normalizeEnabled(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return !['否', '不启用', '停用', '禁用', 'false', '0', 'no'].includes(normalized);
}

function downloadBlob(buffer: ArrayBuffer | BlobPart, filename: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function formatDate() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}
