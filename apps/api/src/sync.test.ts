import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateScore, isNicknameTakenBySignedInUser } from "./sync.js";

vi.mock("./db.js", () => ({ sql: vi.fn() }));

describe("validateScore", () => {
  it("accepts valid score within bounds", () => {
    expect(validateScore(0, 5, 1000, "reflex_level_0", "LEVEL_COMPLETED")).toBe(true);
    expect(validateScore(0, 10, 5000, "reflex_level_1", "LEVEL_COMPLETED")).toBe(true);
    expect(validateScore(1_000_000, 0, 0, "random", "RANDOM_LEVEL_PLAYED")).toBe(true);
  });

  it("rejects negative score", () => {
    expect(validateScore(-1, 0, 0, "reflex_level_0", "LEVEL_COMPLETED")).toBe(false);
  });

  it("rejects score above MAX_SCORE", () => {
    expect(validateScore(1_000_001, 0, 0, "reflex_level_0", "LEVEL_COMPLETED")).toBe(false);
  });

  it("rejects negative moves", () => {
    expect(validateScore(0, -1, 0, "reflex_level_0", "LEVEL_COMPLETED")).toBe(false);
  });

  it("rejects negative timeMs", () => {
    expect(validateScore(0, 0, -1, "reflex_level_0", "LEVEL_COMPLETED")).toBe(false);
  });

  it("validates pixelz score correctly", () => {
    expect(validateScore(0, 0, 5000, "pixelz_level_1", "LEVEL_COMPLETED")).toBe(true);
    expect(validateScore(0, 1, 5000, "pixelz_level_1", "LEVEL_COMPLETED")).toBe(true);
    expect(validateScore(10000, 0, 5000, "pixelz_level_1", "LEVEL_COMPLETED")).toBe(false);
  });

  it("validates reflex score must be 0", () => {
    expect(validateScore(0, 10, 5000, "reflex_level_1", "LEVEL_COMPLETED")).toBe(true);
    expect(validateScore(100, 10, 5000, "reflex_level_1", "LEVEL_COMPLETED")).toBe(false);
  });
});

describe("isNicknameTakenBySignedInUser", () => {
  it("returns false when no rows", () => {
    expect(isNicknameTakenBySignedInUser([])).toBe(false);
  });

  it("returns false when only anonymous users have the nickname", () => {
    expect(
      isNicknameTakenBySignedInUser([{ supabase_auth_id: null }, { supabase_auth_id: null }])
    ).toBe(false);
  });

  it("returns true when a signed-in user has the nickname", () => {
    expect(
      isNicknameTakenBySignedInUser([{ supabase_auth_id: null }, { supabase_auth_id: "uuid-123" }])
    ).toBe(true);
  });

  it("returns true when only signed-in user has the nickname", () => {
    expect(isNicknameTakenBySignedInUser([{ supabase_auth_id: "uuid-456" }])).toBe(true);
  });
});
