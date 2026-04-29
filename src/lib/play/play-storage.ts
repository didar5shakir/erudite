import type { Person, PlaySession } from './types';

export function getStorageKey(locale: string): string {
  return `erudite:play:v1:${locale}`;
}

export function createNewSession(locale: string, deck: Person[]): PlaySession {
  const now = new Date().toISOString();
  let sessionId: string;
  try {
    sessionId = crypto.randomUUID();
  } catch {
    sessionId = String(Date.now());
  }

  return {
    version: 1,
    locale,
    sessionId,
    deck,
    cardIds: deck.map((p) => p.wikidata_id),
    createdAt: now,
    updatedAt: now,
    currentIndex: 0,
    answers: {},
    completed: false,
  };
}

export function saveSession(session: PlaySession): void {
  if (typeof window === 'undefined') return;
  const updated: PlaySession = { ...session, updatedAt: new Date().toISOString() };
  localStorage.setItem(getStorageKey(session.locale), JSON.stringify(updated));
}

export function loadSession(locale: string): PlaySession | null {
  if (typeof window === 'undefined') return null;

  const key = getStorageKey(locale);
  const raw = localStorage.getItem(key);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    localStorage.removeItem(key);
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  const idx = obj.currentIndex;

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    obj.version !== 1 ||
    obj.locale !== locale ||
    !Array.isArray(obj.deck) ||
    (obj.deck as unknown[]).length !== 50 ||
    !Array.isArray(obj.cardIds) ||
    (obj.cardIds as unknown[]).length !== 50 ||
    typeof idx !== 'number' ||
    idx < 0 ||
    idx > 50 ||
    typeof obj.answers !== 'object' ||
    obj.answers === null ||
    typeof obj.completed !== 'boolean'
  ) {
    localStorage.removeItem(key);
    return null;
  }

  return parsed as PlaySession;
}

export function clearSession(locale: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(getStorageKey(locale));
}
