import { parseBRLMoneyInput } from "./money";

const cases: Array<[string, number]> = [
  ["10", 10], ["10,00", 10], ["10.00", 10], ["10,90", 10.9], ["10.90", 10.9],
  ["0,10", 0.1], ["0.10", 0.1], ["0,01", 0.01], ["0.01", 0.01],
  ["23.00", 23], ["23,00", 23], ["100", 100], ["100,00", 100], ["100.00", 100],
  ["1000", 1000], ["1.000,00", 1000], ["1,000.00", 1000], ["10900", 10900],
  ["10.900,00", 10900], ["10,900.00", 10900], ["R$ 10,90", 10.9], ["R$ 1.234,56", 1234.56],
];

for (const [input, expected] of cases) {
  const actual = parseBRLMoneyInput(input);
  if (actual !== expected) throw new Error(`${input}: expected ${expected}, got ${actual}`);
}

for (const input of ["abc", "--10", "10,,90", "10.9000"]) {
  if (parseBRLMoneyInput(input) !== null) throw new Error(`${input}: invalid value was accepted`);
}

console.log(`money parser: ${cases.length} valid cases and 4 invalid cases passed`);
