// Anonymous, per-browser identifier for aggregated analytics.
// Generated once and persisted in localStorage. It is a random UUID with NO link
// to any personal data, account, or cross-site identity — purely a way to group a
// single browser's checkpoint events. Stage 6.3a.

const ANON_ID_KEY = 'erudite:anonymous-id:v1';

export function getAnonymousId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage disabled — analytics is best-effort, never blocks UX.
    return null;
  }
}
