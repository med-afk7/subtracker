// True for IANA names the runtime knows, e.g. "Europe/London", "America/Vancouver", "UTC"
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
