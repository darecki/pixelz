export const GAME = {
  MAX_SCORE: 1_000_000,
  NICKNAME_MAX_LENGTH: 32,
  LEADERBOARD_TOP_N: 100,
  /** Base score before penalties (deterministic scoring). */
  SCORE_BASE: 10_000,
  /** Points lost per move. */
  SCORE_MOVE_PENALTY: 50,
  /** Time units (ms) that cost 1 point. */
  SCORE_TIME_PENALTY_MS: 20,
} as const;

/**
 * Deterministic score from moves and time. Server uses same bounds (0..MAX_SCORE).
 */
export function computeScore(moves: number, timeMs: number): number {
  const raw =
    GAME.SCORE_BASE -
    moves * GAME.SCORE_MOVE_PENALTY -
    Math.floor(timeMs / GAME.SCORE_TIME_PENALTY_MS);
  return Math.min(GAME.MAX_SCORE, Math.max(0, Math.floor(raw)));
}
