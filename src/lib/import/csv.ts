export type CsvRow = Record<string, string>;

function splitLine(line: string, separator: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === separator && !quoted) { values.push(value.trim()); value = ""; continue; }
    value += char;
  }
  values.push(value.trim());
  return values;
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const separator = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = splitLine(lines[0], separator).map((header) => header.toLowerCase().trim());
  return lines.slice(1).map((line) => {
    const cells = splitLine(line, separator);
    return headers.reduce<CsvRow>((row, header, index) => { row[header] = cells[index] ?? ""; return row; }, {});
  });
}

export function csvValue(row: CsvRow, aliases: string[]): string {
  const key = Object.keys(row).find((candidate) => aliases.includes(candidate.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
  return key ? row[key] : "";
}
