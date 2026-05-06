import {
  createInitialAdaptiveProfile,
  type AdaptiveProfile,
} from './adaptive-profile';

const ADAPTIVE_STORAGE_KEY = 'erudite:adaptive-profile:v1';

export function loadAdaptiveProfile(): AdaptiveProfile | null {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(ADAPTIVE_STORAGE_KEY);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    localStorage.removeItem(ADAPTIVE_STORAGE_KEY);
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    obj.version !== 1 ||
    typeof obj.weights !== 'object' ||
    obj.weights === null ||
    typeof obj.stats !== 'object' ||
    obj.stats === null ||
    !Array.isArray(obj.answers)
  ) {
    localStorage.removeItem(ADAPTIVE_STORAGE_KEY);
    return null;
  }

  return parsed as AdaptiveProfile;
}

export function saveAdaptiveProfile(profile: AdaptiveProfile): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ADAPTIVE_STORAGE_KEY, JSON.stringify(profile));
}

export function clearAdaptiveProfile(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADAPTIVE_STORAGE_KEY);
}

export function getOrCreateAdaptiveProfile(): AdaptiveProfile {
  return loadAdaptiveProfile() ?? createInitialAdaptiveProfile();
}
