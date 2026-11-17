export interface CustomerServiceXlsxTemplateColumn {
  key: string;
  label: string;
  width?: number;
}

export interface CustomerServiceXlsxTemplateSpec {
  fileName: string;
  sheetName: string;
  columns: CustomerServiceXlsxTemplateColumn[];
  sampleRows?: Array<Record<string, unknown>>;
  note?: string;
}

export interface CustomerServiceParsedXlsxRow {
  rowNumber: number;
  values: Record<string, string>;
}

export async function downloadCustomerServiceXlsxTemplate(spec: CustomerServiceXlsxTemplateSpec) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(spec.sheetName.slice(0, 31) || '导入模板');
  sheet.columns = spec.columns.map((column) => ({
    header: column.label,
    key: column.key,
    width: column.width || 20,
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 28;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF4FF' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD9E2EC' } },
      left: { style: 'thin', color: { argb: 'FFD9E2EC' } },
      bottom: { style: 'thin', color: { argb: 'FFD9E2EC' } },
      right: { style: 'thin', color: { argb: 'FFD9E2EC' } },
    };
  });
  for (const sample of spec.sampleRows || []) sheet.addRow(sample);
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${columnName(spec.columns.length)}1` };
  if (spec.note) {
    const noteSheet = workbook.addWorksheet('填写说明');
    noteSheet.getCell('A1').value = spec.note;
    noteSheet.getCell('A1').alignment = { wrapText: true, vertical: 'top' };
    noteSheet.getColumn(1).width = 90;
    noteSheet.getRow(1).height = 80;
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = spec.fileName.endsWith('.xlsx') ? spec.fileName : `${spec.fileName}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function parseCustomerServiceXlsx(file: File): Promise<CustomerServiceParsedXlsxRow[]> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('请选择 .xlsx 文件');
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer() as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, col) => {
    headers[col - 1] = String(cell.text || cell.value || '').trim();
  });
  if (!headers.some(Boolean)) throw new Error('Excel 第一行必须是表头');
  const rows: CustomerServiceParsedXlsxRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      values[header] = String(row.getCell(index + 1).text || '').trim();
    });
    if (Object.values(values).some((value) => value.trim())) rows.push({ rowNumber, values });
  });
  return rows;
}

function columnName(index: number) {
  let value = Math.max(1, Math.trunc(index));
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}
