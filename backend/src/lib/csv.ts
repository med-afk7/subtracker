// CSV writing (RFC 4180) with spreadsheet formula-injection protection.

// Text starting with one of these is run as a formula by Excel, Sheets and LibreOffice, e.g.
// a subscription named =HYPERLINK("http://evil","click"). A leading apostrophe makes them treat
// it as plain text. Applied to user-entered text only, so amounts and dates stay numeric.
const FORMULA_START = /^[=+\-@\t\r]/;

export function neutralizeFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

// Quote a field when it contains a comma, quote or line break; double any quotes inside
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvRow = (fields: (string | number | null | undefined)[]) =>
  `${fields.map(escapeCsvField).join(',')}\r\n`;

// Excel only reads UTF-8 correctly (accents, currency symbols) when the file starts with a BOM
export const UTF8_BOM = '\uFEFF';
