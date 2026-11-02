export type CsvValue = string | number | boolean | Date | null | undefined;

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => CsvValue;
};

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV field (RFC 4180 quoting).
 *
 * Strings that a spreadsheet would interpret as a formula (`=`, `+`, `-`, `@`, tab, CR) are
 * prefixed with an apostrophe so opening the file in Excel/Sheets cannot execute attacker-
 * controlled text (CSV injection). Numbers and dates are emitted as-is: a negative number is
 * data, not a formula.
 */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  let s = value instanceof Date ? value.toISOString() : value;
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise rows to CSV with CRLF line endings and a UTF-8 BOM (so Excel reads accents correctly). */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => csvField(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvField(c.value(row))).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
