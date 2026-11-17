import ExcelJS from 'exceljs';
import type { CommentMatchType, CommentReplyDatasetRow } from '@/api/modules/autoReplies';

export async function parseCommentDatasetRows(file: File): Promise<CommentReplyDatasetRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const rows: CommentReplyDatasetRow[] = [];

  workbook.worksheets.forEach((sheet) => {
    const headerRow = sheet.getRow(1);
    const headerMap = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      headerMap.set(String(cell.value ?? '').trim(), colNumber);
    });

    const findCol = (...names: string[]) => names.map((name) => headerMap.get(name)).find((value): value is number => Boolean(value)) ?? 0;
    const commentCol = findCol('commentContent', '评论内容', '评论', '用户评论');
    const replyCol = findCol('replyContent', '配套回复', '回复内容', '应回复数据', '应回复内容');
    if (!commentCol || !replyCol) return;

    const keywordCol = findCol('keywords', '关键词', '匹配关键词');
    const matchTypeCol = findCol('matchType', '匹配方式', '匹配类型');
    const priorityCol = findCol('priority', '优先级');
    const enabledCol = findCol('enabled', '启用', '是否启用');

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const commentContent = getCellText(row.getCell(commentCol));
      const replyContent = getCellText(row.getCell(replyCol));
      if (!commentContent || !replyContent) return;

      rows.push({
        commentContent,
        replyContent,
        keywords: keywordCol ? splitKeywords(getCellText(row.getCell(keywordCol))) : [],
        matchType: normalizeMatchType(matchTypeCol ? getCellText(row.getCell(matchTypeCol)) : ''),
        priority: priorityCol ? Number(getCellText(row.getCell(priorityCol))) || 0 : 0,
        enabled: enabledCol ? normalizeEnabled(getCellText(row.getCell(enabledCol))) : true
      });
    });
  });

  return rows;
}

export function getCellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim();
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((item) => String(item.text ?? '')).join('').trim();
  }
  return String(value).trim();
}

export function splitKeywords(value: string) {
  return value
    .split(/[，,;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeMatchType(value: string): CommentMatchType {
  const upper = value.toUpperCase();
  if (!value) return 'EXACT';
  if (upper === 'EXACT' || value === '精确' || value === '精准' || value === '精确匹配' || value === '精准匹配') return 'EXACT';
  if (upper === 'CONTAINS' || value === '包含' || value === '包含匹配') return 'CONTAINS';
  if (upper === 'FUZZY' || value === '模糊' || value === '模糊匹配') return 'FUZZY';
  return 'EXACT';
}

export function normalizeEnabled(value: string) {
  if (!value) return true;
  return !['false', '0', '否', '不启用', '停用'].includes(value.toLowerCase());
}
