import { describe, it, expect } from 'vitest';
import { getAnalyticsPeriod, shiftAnchor, formatTrend } from '../analyticsPeriod';

// 2026-04-22 is a Wednesday.
const wed = new Date(2026, 3, 22, 15, 30);

describe('getAnalyticsPeriod', () => {
  it('weekly: Monday to next Monday, previous week right before it', () => {
    const p = getAnalyticsPeriod('weekly', wed);
    expect(p.start).toEqual(new Date(2026, 3, 20));
    expect(p.end).toEqual(new Date(2026, 3, 27));
    expect(p.prevStart).toEqual(new Date(2026, 3, 13));
    expect(p.prevEnd).toEqual(new Date(2026, 3, 20));
    expect(p.compareLabel).toBe('Semana anterior');
  });

  it('weekly: a Sunday belongs to the week that started the Monday before', () => {
    const p = getAnalyticsPeriod('weekly', new Date(2026, 3, 26, 23, 59));
    expect(p.start).toEqual(new Date(2026, 3, 20));
  });

  it('daily: the selected day against the day before', () => {
    const p = getAnalyticsPeriod('daily', wed);
    expect(p.start).toEqual(new Date(2026, 3, 22));
    expect(p.end).toEqual(new Date(2026, 3, 23));
    expect(p.prevStart).toEqual(new Date(2026, 3, 21));
    expect(p.compareLabel).toBe('Día anterior');
  });

  it('monthly: the calendar month against the previous one, across a year boundary', () => {
    const p = getAnalyticsPeriod('monthly', new Date(2026, 0, 15));
    expect(p.start).toEqual(new Date(2026, 0, 1));
    expect(p.end).toEqual(new Date(2026, 1, 1));
    expect(p.prevStart).toEqual(new Date(2025, 11, 1));
    expect(p.prevEnd).toEqual(new Date(2026, 0, 1));
    expect(p.compareLabel).toBe('Mes anterior');
  });

  it('labels name the selected period', () => {
    expect(getAnalyticsPeriod('monthly', wed).label.toLowerCase()).toContain('abril');
    expect(getAnalyticsPeriod('monthly', wed).label).toContain('2026');
    expect(getAnalyticsPeriod('weekly', wed).label).toMatch(/20/);
    expect(getAnalyticsPeriod('weekly', wed).label).toMatch(/26/);
    expect(getAnalyticsPeriod('daily', wed).label).toMatch(/22/);
  });
});

describe('shiftAnchor', () => {
  it('moves by one period in each direction', () => {
    expect(shiftAnchor('daily', wed, -1)).toEqual(new Date(2026, 3, 21, 15, 30));
    expect(shiftAnchor('weekly', wed, 1)).toEqual(new Date(2026, 3, 29, 15, 30));
    expect(shiftAnchor('monthly', new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 1));
  });
});

describe('formatTrend', () => {
  it('formats growth, drop and no change', () => {
    expect(formatTrend(114, 100)).toBe('+14%');
    expect(formatTrend(50, 100)).toBe('-50%');
    expect(formatTrend(5, 5)).toBe('0%');
    expect(formatTrend(0, 0)).toBe('0%');
  });

  it('does not invent a percentage when the previous period had no consultations', () => {
    expect(formatTrend(7, 0)).toBe('Nuevo');
  });
});
