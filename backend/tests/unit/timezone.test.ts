import { describe, expect, it } from 'vitest';
import { isValidTimezone } from '../../src/domain/timezone.js';

describe('isValidTimezone', () => {
  it.each(['UTC', 'Europe/London', 'America/Los_Angeles', 'Asia/Kolkata'])('accepts %s', (tz) => {
    expect(isValidTimezone(tz)).toBe(true);
  });

  it.each(['', 'Mars/Base', 'GMT+25', 'not a zone'])('rejects %j', (tz) => {
    expect(isValidTimezone(tz)).toBe(false);
  });
});
