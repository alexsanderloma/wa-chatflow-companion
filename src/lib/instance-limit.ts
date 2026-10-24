export function instanceLimit(value: unknown): number {
  if (value === null || value === undefined) return 1;
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 0 ? limit : 1;
}