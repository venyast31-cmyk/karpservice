export function reminderDate(scheduledFor, now = Date.now()) {
  const starts = Date.parse(scheduledFor);
  if (!Number.isFinite(starts) || starts - now < 60_000) return null;
  // Prefer one hour; for a near-term booking remind fifteen minutes beforehand.
  const lead = starts - now > 61 * 60_000 ? 60 * 60_000 : 15 * 60_000;
  const at = starts - lead;
  return at > now + 10_000 ? new Date(at) : null;
}

export function notificationId(scheduledFor) {
  return Math.floor(Date.parse(scheduledFor) / 60_000) % 2_147_483_647;
}
