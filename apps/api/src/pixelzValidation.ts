import { replayPixelzMoveSequence, type PixelzBoardSpec } from "@pixelz/shared";

type SqlExecutor = any;

type PixelzBoardRow = {
  width: number;
  height: number;
  num_colors: number;
  seed: string;
};

export type PixelzCompletionValidationResult =
  | { valid: true; moves: number }
  | {
      valid: false;
      reason:
        | "board_not_found"
        | "invalid_board"
        | "invalid_move_value"
        | "out_of_range_move"
        | "redundant_move"
        | "board_not_solved";
    };

export async function getPixelzBoardSpec(
  executor: SqlExecutor,
  levelId: string
): Promise<PixelzBoardSpec | null> {
  const rows = await executor`
    select width, height, num_colors, seed
    from public.boards
    where id = ${levelId}
    limit 1
  ` as PixelzBoardRow[];
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    width: Number(row.width),
    height: Number(row.height),
    numColors: Number(row.num_colors),
    seed: String(row.seed),
  };
}

export async function validatePixelzCompletion(
  executor: SqlExecutor,
  levelId: string,
  moveSequence: number[]
): Promise<PixelzCompletionValidationResult> {
  const board = await getPixelzBoardSpec(executor, levelId);
  if (!board) return { valid: false, reason: "board_not_found" };

  const replay = replayPixelzMoveSequence(board, moveSequence);
  if (!replay.valid) {
    return { valid: false, reason: replay.reason };
  }
  if (!replay.solved) {
    return { valid: false, reason: "board_not_solved" };
  }
  return { valid: true, moves: replay.moves };
}
