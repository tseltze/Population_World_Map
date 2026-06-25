// Display formatting for numeric World Bank values. "No data" is the agreed
// rendering for an absent value, kept in one place so every view matches.

function grouped(value: number): string {
  return Math.round(value).toLocaleString();
}

export function formatCurrency(value: number | null): string {
  return value == null ? 'No data' : `$${grouped(value)}`;
}

export function formatCount(value: number | null): string {
  return value == null ? 'No data' : grouped(value);
}
