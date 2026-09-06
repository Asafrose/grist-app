import { initials, segmentAt, speakers } from "@/lib/transcript";

const segs = [
  { start: 0, end: 1000, speaker: "Ana Lima", text: "a" },
  { start: 1000, end: 2500, speaker: "Ben Ortiz", text: "b" },
  { start: 4000, end: 5000, speaker: "Ana Lima", text: "c" },
];

describe("segmentAt", () => {
  it("returns the segment containing the position", () => {
    expect(segmentAt(segs, 0)?.text).toBe("a");
    expect(segmentAt(segs, 999)?.text).toBe("a");
    expect(segmentAt(segs, 1000)?.text).toBe("b");
    expect(segmentAt(segs, 4500)?.text).toBe("c");
  });

  it("keeps the previous line during gaps and after the last segment", () => {
    expect(segmentAt(segs, 3000)?.text).toBe("b");
    expect(segmentAt(segs, 99_000)?.text).toBe("c");
  });

  it("returns null before the first segment or for an empty transcript", () => {
    expect(segmentAt(segs, -1)).toBeNull();
    expect(segmentAt([], 10)).toBeNull();
  });
});

describe("speakers", () => {
  it("lists distinct speakers in order of first appearance", () => {
    expect(speakers(segs)).toEqual(["Ana Lima", "Ben Ortiz"]);
    expect(speakers([])).toEqual([]);
  });
});

describe("initials", () => {
  it("takes the first letters of the first two words", () => {
    expect(initials("Ana Lima")).toBe("AL");
    expect(initials("marcus  kowalski jr")).toBe("MK");
    expect(initials("Cher")).toBe("C");
    expect(initials("  ")).toBe("?");
  });
});
