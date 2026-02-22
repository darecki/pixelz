import { describe, expect, it } from "vitest";
import { createSessionSchema, finishSessionSchema } from "./sessions.js";

describe("createSessionSchema", () => {
  it("accepts valid predefined pixelz session", () => {
    const parsed = createSessionSchema.safeParse({
      game: "pixelz",
      mode: "predefined",
      levelId: "pixelz_level_1",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts valid generated pixelz session", () => {
    const parsed = createSessionSchema.safeParse({
      game: "pixelz",
      mode: "generated",
      settings: { width: 7, height: 10, numColors: 5 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid predefined pixelz level id", () => {
    const parsed = createSessionSchema.safeParse({
      game: "pixelz",
      mode: "predefined",
      levelId: "not-a-level",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts valid reflex predefined level id", () => {
    const parsed = createSessionSchema.safeParse({
      game: "reflex",
      mode: "predefined",
      levelId: "reflex_level_1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid reflex level id", () => {
    const parsed = createSessionSchema.safeParse({
      game: "reflex",
      mode: "predefined",
      levelId: "reflex_unknown",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("finishSessionSchema", () => {
  it("accepts valid payload", () => {
    const parsed = finishSessionSchema.safeParse({
      moves: 10,
      timeMs: 5000,
      moveSequence: [1, 2, 3],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative values", () => {
    const parsed = finishSessionSchema.safeParse({
      moves: -1,
      timeMs: -100,
    });
    expect(parsed.success).toBe(false);
  });
});
