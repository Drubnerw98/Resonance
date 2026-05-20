import { describe, expect, it } from "vitest";
import { isUuid } from "./validateUuidParam.js";

describe("isUuid", () => {
  it("accepts a standard hyphenated UUID", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts uppercase hex", () => {
    expect(isUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("rejects a non-UUID string", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("rejects a UUID with the hyphens stripped", () => {
    expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("rejects a UUID with trailing characters", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000x")).toBe(false);
  });

  it("rejects an empty string and non-string values", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});
