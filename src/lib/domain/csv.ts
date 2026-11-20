import Papa from "papaparse";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 10_000;

/** Parses delimited text (CSV/TSV/semicolon) into a grid. Handles quoted fields and embedded newlines. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { delimiter, dynamicTyping: false, skipEmptyLines: "greedy" });
  const error = result.errors.find((issue) => issue.code !== "UndetectableDelimiter");
  if (error) throw new Error(`Row ${(error.row ?? 0) + 1}: ${error.message}`);
  return result.data;
}

function isBlank(cell: unknown) {
  return cell == null || (typeof cell === "string" && !cell.trim());
}

export interface PreviewRow {
  record: number;
  values: Record<string, string>;
  errors: string[];
}

/** Maps columns by index (so duplicate headings stay selectable) and validates each row. */
export function previewRows(
  [header, ...rows]: string[][],
  columns: Record<string, number>,
  validate: (values: Record<string, string>) => string[],
  headerRow = 1,
): PreviewRow[] {
  if (!header?.some((cell) => !isBlank(cell))) throw new Error("The file has no header row.");
  const mapping = Object.entries(columns);
  if (!mapping.length) throw new Error("Map at least one column.");
  for (const [field, index] of mapping) {
    if (!Number.isInteger(index) || index < 0 || index >= header.length) {
      throw new Error(`Choose a column for ${field}.`);
    }
  }
  return rows.flatMap((cells, index) => {
    if (cells.every(isBlank)) return [];
    const values: Record<string, string> = Object.fromEntries(
      mapping.map(([field, column]) => [field, (cells[column] ?? "").trim()]),
    );
    const errors =
      cells.length === header.length
        ? validate(values)
        : [`Expected ${header.length} columns, found ${cells.length}.`];
    return [{ record: headerRow + index + 1, values, errors }];
  });
}

/** Builds a CSV document from rows, quoting where required. */
export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
