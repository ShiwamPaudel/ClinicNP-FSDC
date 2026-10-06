/**
 * csv.ts — reading a spreadsheet somebody saved out of Excel.
 *
 * Deliberately small and deliberately not a dependency. The files this reads
 * are typed by hand in Excel or Google Sheets and saved as CSV, so the only
 * things that actually happen to them are the ones handled here: a comma
 * inside a quoted product name ("Vicks VapoRub, 25g"), a doubled quote inside
 * a quoted field, Windows line endings, and a UTF-8 BOM that Excel adds
 * without being asked and that would otherwise glue itself to the first
 * header name and make it unmatchable.
 *
 * No type coercion lives here. Every value comes out a string exactly as it
 * was typed, and deciding what "10" or "Yes" or "" means is the caller's job —
 * a parser that guesses is a parser that turns an empty price into a zero.
 */

/** Parse CSV text into rows of raw string cells. */
export function parseCsv(text: string): string[][] {
  // Excel writes a BOM on "CSV UTF-8". Left in place it becomes part of the
  // first header name, and every lookup of that column silently misses.
  const src = text.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i]!;

    if (quoted) {
      if (c === '"') {
        // "" inside a quoted field is one literal quote.
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"' && field === "") {
      quoted = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      // \r\n is one break; a lone \r is one too.
      if (src[i + 1] === "\n") i++;
      endRow();
      i++;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Whatever is buffered at EOF is a final row, unless the file ended on a
  // newline and there is nothing pending.
  if (field !== "" || row.length > 0) endRow();

  return rows;
}

export interface CsvTable {
  headers: string[];
  /** One record per data row, keyed by header. Row numbers are 1-based and
   *  count the header, so they match what Excel shows in its left margin. */
  records: { rowNumber: number; get: (column: string) => string }[];
}

/**
 * Turn parsed rows into header-keyed records.
 *
 * A row that is entirely empty ends the table. Excel routinely leaves a
 * thousand blank rows under the last one somebody typed, and reading those as
 * a thousand items with no name is not a useful thing to do.
 */
export function toTable(rows: string[][]): CsvTable {
  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((h) => h.trim());

  const records: CsvTable["records"] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r] ?? [];
    if (cells.every((c) => c.trim() === "")) break;
    const byName = new Map<string, string>();
    headers.forEach((h, idx) => byName.set(h, (cells[idx] ?? "").trim()));
    records.push({
      rowNumber: r + 1,
      get: (column: string) => byName.get(column) ?? "",
    });
  }
  return { headers, records };
}

/** Parse and key in one step. */
export function readCsv(text: string): CsvTable {
  return toTable(parseCsv(text));
}

/** Header names present in `required` but missing from the file. */
export function missingColumns(
  table: CsvTable,
  required: readonly string[],
): string[] {
  return required.filter((c) => !table.headers.includes(c));
}
