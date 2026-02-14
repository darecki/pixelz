import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateScore, isNicknameTakenBySignedInUser } from "./sync.js";

vi.mock("./db.js", () => ({ sql: vi.fn() }));

describe("validateScore", () => {
  it("accepts valid score within bounds", () => {
    expect(validateScore(0, 0, 0)).toBe(true);
    expect(validateScore(100, 5, 1000)).toBe(true);
    expect(validateScore(1_000_000, 0, 0)).toBe(true);
  });

  it("rejects negative score", () => {
    expect(validateScore(-1, 0, 0)).toBe(false);
  });

  it("rejects score above MAX_SCORE", () => {
    expect(validateScore(1_000_001, 0, 0)).toBe(false);
  });

  it("rejects negative moves", () => {
    expect(validateScore(0, -1, 0)).toBe(false);
  });

  it("rejects negative timeMs", () => {
    expect(validateScore(0, 0, -1)).toBe(false);
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
