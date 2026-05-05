/**
 * Formats a birth–death year range with locale-aware BC notation.
 *
 * BC rules:
 *   en → "44 BC" / "100–44 BC"
 *   ru → "44 до н.э." / "100–44 до н.э."
 *   kk → "б.з.д. 44" / "б.з.д. 100–44"
 */
export function formatYearRange(
  birthyear: number | null | undefined,
  deathyear: number | null | undefined,
  locale: string,
): string {
  if (birthyear == null && deathyear == null) return '';

  function bcWrap(abs: string): string {
    if (locale === 'kk') return `б.з.д. ${abs}`;
    if (locale === 'ru') return `${abs} до н.э.`;
    return `${abs} BC`;
  }

  // Only birthyear known (living or unknown death)
  if (deathyear == null) {
    if (birthyear == null) return '';
    if (birthyear >= 0) return `${birthyear}–`;
    return `${bcWrap(String(Math.abs(birthyear)))}–`;
  }

  // Only deathyear known (rare edge case)
  if (birthyear == null) return `–${deathyear}`;

  // Both known — case 3: both AD
  if (birthyear >= 0 && deathyear >= 0) return `${birthyear}–${deathyear}`;

  // Both known — case 4: both BC
  if (birthyear < 0 && deathyear < 0) {
    const range = `${Math.abs(birthyear)}–${Math.abs(deathyear)}`;
    if (locale === 'kk') return `б.з.д. ${range}`;
    if (locale === 'ru') return `${range} до н.э.`;
    return `${range} BC`;
  }

  // Case 5: BC birth → AD death (cross-era)
  if (birthyear < 0 && deathyear >= 0) {
    const from = Math.abs(birthyear);
    if (locale === 'kk') return `б.з.д. ${from}–${deathyear}`;
    if (locale === 'ru') return `${from} до н.э.–${deathyear}`;
    return `${from} BC–${deathyear}`;
  }

  // Case 6: impossible (born after death), fall back gracefully
  return `${birthyear}–${deathyear}`;
}
