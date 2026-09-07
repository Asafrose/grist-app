import {
  highlightRuns,
  indexAt,
  matchingSegments,
  normalizeQuery,
  speakerColors,
  stepMatch,
} from "@/lib/transcript-reader";

const segs = [
  { start: 0, end: 1000, speaker: "Ana Lima", text: "Pricing is per seat." },
  { start: 1000, end: 2500, speaker: "Ben Ortiz", text: "So pricing scales with the team?" },
  { start: 4000, end: 5000, speaker: "Ana Lima", text: "Yes, no volume pricing." },
  { start: 6000, end: 7000, speaker: "Cy Doe", text: "Got it." },
];

describe("normalizeQuery", () => {
  it("trims and lowercases", () => {
    expect(normalizeQuery("  PriCing ")).toBe("pricing");
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("matchingSegments", () => {
  it("returns the indices of segments containing the query, case-insensitively", () => {
    expect(matchingSegments(segs, "Pricing")).toEqual([0, 1, 2]);
    expect(matchingSegments(segs, "got")).toEqual([3]);
  });

  it("returns nothing for a blank query or no hits", () => {
    expect(matchingSegments(segs, " ")).toEqual([]);
    expect(matchingSegments(segs, "zebra")).toEqual([]);
  });
});

describe("highlightRuns", () => {
  it("splits text into matching and plain runs, preserving original case", () => {
    expect(highlightRuns("Pricing is pricing.", "PRICING")).toEqual([
      { text: "Pricing", match: true, at: 0 },
      { text: " is ", match: false, at: 7 },
      { text: "pricing", match: true, at: 11 },
      { text: ".", match: false, at: 18 },
    ]);
  });

  it("returns one plain run when the query is blank or absent", () => {
    expect(highlightRuns("Hello", "")).toEqual([{ text: "Hello", match: false, at: 0 }]);
    expect(highlightRuns("Hello", "x")).toEqual([{ text: "Hello", match: false, at: 0 }]);
  });

  it("handles a match at the very end", () => {
    expect(highlightRuns("say hi", "hi")).toEqual([
      { text: "say ", match: false, at: 0 },
      { text: "hi", match: true, at: 4 },
    ]);
  });
});

describe("stepMatch", () => {
  it("wraps in both directions", () => {
    expect(stepMatch(0, 3, 1)).toBe(1);
    expect(stepMatch(2, 3, 1)).toBe(0);
    expect(stepMatch(0, 3, -1)).toBe(2);
  });

  it("returns -1 with no matches", () => {
    expect(stepMatch(0, 0, 1)).toBe(-1);
  });
});

describe("indexAt", () => {
  it("finds the segment index for a position, keeping the previous one during gaps", () => {
    expect(indexAt(segs, 0)).toBe(0);
    expect(indexAt(segs, 1200)).toBe(1);
    expect(indexAt(segs, 3000)).toBe(1);
    expect(indexAt(segs, 99_000)).toBe(3);
  });

  it("returns -1 before the first segment or for an empty list", () => {
    expect(indexAt(segs, -5)).toBe(-1);
    expect(indexAt([], 10)).toBe(-1);
  });
});

describe("speakerColors", () => {
  it("assigns colours in first-appearance order and wraps the palette", () => {
    const map = speakerColors(segs, ["red", "blue"]);
    expect(map.get("Ana Lima")).toBe("red");
    expect(map.get("Ben Ortiz")).toBe("blue");
    expect(map.get("Cy Doe")).toBe("red");
  });
});
