/** Month helpers over "month start" strings (`YYYY-MM-01`), the key used by goals and metrics. */

const pad = (n: number) => String(n).padStart(2, '0');

export const monthStart = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`;

export const shiftMonth = (month: string, delta: number): string => {
  const [year, m] = month.split('-').map(Number);
  return monthStart(new Date(year, m - 1 + delta, 1));
};

export const formatMonthLabel = (month: string): string => {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
};
