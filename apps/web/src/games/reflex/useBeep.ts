import { useCallback, useRef } from "react";
import { LONG_BEEP_MS, SHORT_BEEP_MS } from "./constants";

export function useBeep() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const ensureContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const beep = useCallback(
    (durationMs: number, frequency = 600) => {
      try {
        const ctx = ensureContext();
        if (ctx.state === "suspended") ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = frequency;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + durationMs / 1000);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + durationMs / 1000);
      } catch {
        // Ignore if audio not allowed
      }
    },
    [ensureContext]
  );

  const shortBeep = useCallback(() => beep(SHORT_BEEP_MS), [beep]);
  const longBeep = useCallback(() => beep(LONG_BEEP_MS, 500), [beep]);

  return { shortBeep, longBeep };
}
