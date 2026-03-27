import { formatBoardLabel } from "@pixelz/ts-game-core";

function buildDeepLink(path: string): string {
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  return `pixelz://${trimmed}`;
}

export function buildPlayShareMessage(levelId: string, result: { moves: number; timeMs: number }): string {
  const boardLabel = formatBoardLabel(levelId);
  const deepLink = buildDeepLink(`/play/${encodeURIComponent(levelId)}`);
  return `I just cleared ${boardLabel} in ${result.moves} moves and ${(result.timeMs / 1000).toFixed(2)}s on Pixelz. Try it here: ${deepLink}`;
}

export function buildReflexChallengeShareMessage(levelId: string, timeMs: number, label = "Friend PB"): string {
  const params = new URLSearchParams({
    ghost: "shared",
    ghostTimeMs: `${Math.round(timeMs)}`,
    ghostLabel: label,
  });
  const deepLink = `${buildDeepLink(`/play/${encodeURIComponent(levelId)}`)}?${params.toString()}`;
  return `I just finished ${formatBoardLabel(levelId)} in ${(timeMs / 1000).toFixed(2)}s on Pixelz Reflex. Chase it here: ${deepLink}`;
}

export function buildSessionInviteShareMessage(input: {
  inviteCode: string;
  gameLabel: string;
  boardLabel: string;
  formatLabel: string;
}): string {
  const deepLink = buildDeepLink(`/join/${encodeURIComponent(input.inviteCode)}`);
  return `Join my ${input.gameLabel} session on ${input.boardLabel}. Format: ${input.formatLabel}. Open: ${deepLink}`;
}
