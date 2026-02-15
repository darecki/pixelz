import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock("./db.js", () => ({ sql: mockSql }));

const { getAnonymousAppUserId } = await import("./auth.js");

describe("getAnonymousAppUserId", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("returns null for empty string", async () => {
    expect(await getAnonymousAppUserId("")).toBe(null);
    expect(await getAnonymousAppUserId("   ")).toBe(null);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("returns null for invalid input", async () => {
    expect(await getAnonymousAppUserId(null as unknown as string)).toBe(null);
    expect(await getAnonymousAppUserId(1 as unknown as string)).toBe(null);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("returns null when no row found", async () => {
    mockSql.mockResolvedValue([]);
    expect(await getAnonymousAppUserId("user_abc123")).toBe(null);
    expect(mockSql).toHaveBeenCalled();
  });

  it("returns id when row found", async () => {
    mockSql.mockResolvedValue([{ id: "550e8400-e29b-41d4-a716-446655440000" }]);
    expect(await getAnonymousAppUserId("user_xyz")).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("trims input before query", async () => {
    mockSql.mockResolvedValue([{ id: "uuid-1" }]);
    const out = await getAnonymousAppUserId("  user_abc  ");
    expect(out).toBe("uuid-1");
    expect(mockSql).toHaveBeenCalled();
    expect(mockSql.mock.calls[0][1]).toBe("user_abc");
  });
});
