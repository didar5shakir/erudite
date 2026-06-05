// Sink-agnostic client analytics helper. Stage 6.3a.
//
// Only LOW-FREQUENCY checkpoint/session events are ever sent — never per-answer,
// never per-card, never any QID or person name. The payload is aggregated counts
// + the public estimate + theme zone tags only. No personal data.
//
// Transport: navigator.sendBeacon (fire-and-forget, survives page unload) with a
// fetch keepalive fallback. All failures are swallowed: analytics must never break
// the quiz. The single ingestion point is /api/analytics, so the backend sink can be
// swapped (debug console → Supabase) without touching any call site.

import { getAnonymousId } from './anonymous-id';

export type AnalyticsEvent =
  | 'session_started'
  | 'reached_30'
  | 'result_100'
  | 'result_200'
  | 'result_300'
  | 'continue_clicked'
  | 'share_clicked'
  | 'restart_clicked';

// Aggregated, non-personal payload. Every field is optional: session/checkpoint
// events carry counts only; result-screen events also carry estimate + zones.
export interface AnalyticsPayload {
  session_id?:      string;
  locale?:          string;
  region?:          string;
  total_answers?:   number;
  know_count?:      number;
  heard_count?:     number;
  dont_know_count?: number;
  estimate?:        number;
  range_low?:       number;
  range_high?:      number;
  level?:           string;
  top_zones?:       string[]; // axis:tag theme tags — no person names / QIDs
}

const ENDPOINT = '/api/analytics';

export function track(event: AnalyticsEvent, payload: AnalyticsPayload = {}): void {
  if (typeof window === 'undefined') return;
  try {
    const body = {
      event,
      anonymous_id: getAnonymousId(),
      timestamp: new Date().toISOString(),
      ...payload,
    };
    const json = JSON.stringify(body);

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([json], { type: 'application/json' });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }

    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true,
    }).catch(() => { /* best-effort */ });
  } catch {
    /* analytics must never throw into the UI */
  }
}
