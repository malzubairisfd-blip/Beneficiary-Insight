import ExcelJS from "exceljs";

export async function writeReport(filePath: string, report: any) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Report");

  // Example: expect report.rows = [{colA:..., colB:...}, ...]
  if (Array.isArray(report.rows) && report.rows.length > 0) {
    const cols = Object.keys(report.rows[0]).map((k) => ({ header: k, key: k }));
    sheet.columns = cols;
    report.rows.forEach((r: any) => sheet.addRow(r));
  } else {
    sheet.getCell("A1").value = "No rows provided";
  }
  await workbook.xlsx.writeFile(filePath);
}
