import { describe, expect, it } from "vitest";
import { addChip, parseChips } from "./chips";

describe("parseChips", () => {
    it("splits on comma, trims, drops empties", () => {
        expect(parseChips("React, , Node ,")).toEqual(["React", "Node"]);
    });
    it("returns [] for blank", () => {
        expect(parseChips("   ")).toEqual([]);
    });
});

describe("addChip", () => {
    it("appends a trimmed value", () => {
        expect(addChip(["React"], " Node ")).toEqual(["React", "Node"]);
    });
    it("ignores blank and case-insensitive duplicates", () => {
        expect(addChip(["React"], "react")).toEqual(["React"]);
        expect(addChip(["React"], "  ")).toEqual(["React"]);
    });
});
