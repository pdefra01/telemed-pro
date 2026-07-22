import { describe, it, expect } from 'vitest';
import { calculateDistanceMeters } from '../geo';

describe('calculateDistanceMeters (Haversine)', () => {
  it('returns 0 for identical points', () => {
    const distance = calculateDistanceMeters(-24.7859, -65.4117, -24.7859, -65.4117);
    expect(distance).toBe(0);
  });

  it('returns approximately 1000m for two points ~1km apart', () => {
    // -24.7859,-65.4117 to -24.7949,-65.4117 is ~1000m north-south (1 lat degree ~111.32km).
    const distance = calculateDistanceMeters(-24.7859, -65.4117, -24.7949, -65.4117);
    expect(distance).toBeGreaterThan(970);
    expect(distance).toBeLessThan(1030);
  });

  it('is symmetric regardless of argument order', () => {
    const a = { lat: -24.7859, lon: -65.4117 };
    const b = { lat: -34.6037, lon: -58.3816 };

    const distanceAB = calculateDistanceMeters(a.lat, a.lon, b.lat, b.lon);
    const distanceBA = calculateDistanceMeters(b.lat, b.lon, a.lat, a.lon);

    expect(distanceAB).toBe(distanceBA);
  });
});
