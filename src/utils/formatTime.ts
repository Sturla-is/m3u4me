/**
 * Formats a time-of-day as "HH:MM", honoring the user's 12h/24h clock preference
 * (Settings → is24Hour). The shared formatter for anywhere a timestamp/Date needs to
 * show just its clock time — channel health-check times, EPG timeline markers/tooltips,
 * the channel-pool update log.
 */
export function formatTime(date: Date | number, is24Hour: boolean): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !is24Hour });
}
