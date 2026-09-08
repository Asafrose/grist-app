import { initials, nextSpeakerStart, segmentAt, speakers } from "@/lib/transcript";

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

describe("nextSpeakerStart", () => {
  it("finds the next speaker change from mid-segment, minus the lead", () => {
    expect(nextSpeakerStart(segs, 1200)).toBe(3000);
  });

  it("skips a change that is already inside the lead window", () => {
    expect(nextSpeakerStart(segs, 500)).toBe(3000);
    expect(nextSpeakerStart(segs, 999)).toBe(3000);
  });

  it("returns null when every later change is inside the lead window", () => {
    expect(nextSpeakerStart(segs, 3000)).toBeNull();
    expect(nextSpeakerStart(segs, 3999)).toBeNull();
  });

  it("attributes a gap to the speaker who last spoke", () => {
    expect(nextSpeakerStart(segs, 3000, 0)).toBe(4000);
  });

  it("looks forward from a segment boundary", () => {
    expect(nextSpeakerStart(segs, 1000)).toBe(3000);
  });

  it("returns null while the last speaker is talking", () => {
    expect(nextSpeakerStart(segs, 4000)).toBeNull();
    expect(nextSpeakerStart(segs, 99_000)).toBeNull();
    expect(nextSpeakerStart([], 0)).toBeNull();
  });

  it("skips consecutive segments from the same speaker", () => {
    const same = [
      { start: 0, end: 1000, speaker: "Ana Lima" },
      { start: 1000, end: 2000, speaker: "Ana Lima" },
      { start: 2000, end: 3000, speaker: "Ana Lima" },
      { start: 8000, end: 9000, speaker: "Ben Ortiz" },
    ];
    expect(nextSpeakerStart(same, 0)).toBe(7000);
  });

  it("treats the transcript start as a change when the position precedes it", () => {
    expect(nextSpeakerStart(segs, -1, 0)).toBe(1000);
    expect(nextSpeakerStart([{ start: 4130, end: 5000, speaker: "Ana Lima" }], 0)).toBe(3130);
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
