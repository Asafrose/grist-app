import { splitTimestamps } from "@/lib/summary";

describe("splitTimestamps", () => {
  it("returns plain text untouched", () => {
    expect(splitTimestamps("No times here.")).toEqual(["No times here."]);
    expect(splitTimestamps("")).toEqual([]);
  });

  it("turns m:ss and h:mm:ss tokens into timestamps with milliseconds", () => {
    expect(splitTimestamps("Pricing at 17:04 and again 1:02:03.")).toEqual([
      "Pricing at ",
      { label: "17:04", ms: 1_024_000 },
      " and again ",
      { label: "1:02:03", ms: 3_723_000 },
      ".",
    ]);
  });

  it("ignores clock-like fragments inside words and ISO dates", () => {
    expect(splitTimestamps("v1:2 and 2026-09-06T22:01:18Z")).toEqual([
      "v1:2 and 2026-09-06T22:01:18Z",
    ]);
    expect(splitTimestamps("ratio 10:1")).toEqual(["ratio 10:1"]);
  });
});
