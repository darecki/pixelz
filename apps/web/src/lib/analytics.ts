type AnalyticsEvent =
  | { type: "page_view"; path: string }
  | { type: "game_start"; gameId: string; levelId: string }
  | { type: "game_complete"; gameId: string; levelId: string; score: number; moves: number; timeMs: number }
  | { type: "sync_success" }
  | { type: "sync_error"; error: string }
  | { type: "auth_sign_in" }
  | { type: "auth_sign_out" };

const MAX_QUEUE_SIZE = 50;
const queue: AnalyticsEvent[] = [];

export function trackEvent(event: AnalyticsEvent): void {
  if (import.meta.env.DEV) {
    console.log("[analytics]", event);
  }

  queue.push(event);
  if (queue.length > MAX_QUEUE_SIZE) {
    queue.shift();
  }

  if (import.meta.env.PROD && typeof navigator !== "undefined" && navigator.sendBeacon) {
    const url = import.meta.env.VITE_ANALYTICS_URL;
    if (url) {
      const data = JSON.stringify(event);
      navigator.sendBeacon(url, data);
    }
  }
}

export function getEventQueue(): AnalyticsEvent[] {
  return [...queue];
}

export function clearEventQueue(): void {
  queue.length = 0;
}
