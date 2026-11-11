import { describe, expect, it } from "vitest";
import { isMetaObjectMissingError } from "./campaigns";

describe("isMetaObjectMissingError", () => {
  it("recognizes explicit missing or deleted objects", () => {
    expect(isMetaObjectMissingError("Campaign with ID 123 does not exist")).toBe(true);
    expect(isMetaObjectMissingError("This campaign has been deleted")).toBe(true);
  });

  it("does not treat ambiguous Graph access errors as proof of deletion", () => {
    expect(isMetaObjectMissingError("Unsupported get request: object does not exist, cannot be loaded due to missing permissions, or does not support this operation")).toBe(false);
    expect(isMetaObjectMissingError("Permission denied")).toBe(false);
    expect(isMetaObjectMissingError("Object does not support this operation")).toBe(false);
  });
});
