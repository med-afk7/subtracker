// True for IANA names the runtime knows, e.g. "Europe/London", "America/Los_Angeles", "UTC"
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
