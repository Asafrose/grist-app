import { matchRuns, queryTerms, serializeRuns, snippetRuns } from "@/lib/snippet";

describe("queryTerms", () => {
  it("splits on whitespace and strips FTS syntax characters", () => {
    expect(queryTerms('  pricing  "model"* [x] ')).toEqual(["pricing", "model", "x"]);
    expect(queryTerms("   ")).toEqual([]);
  });
});

describe("snippetRuns", () => {
  it("turns FTS [match] markers into highlighted runs", () => {
    expect(snippetRuns("…we do not [price] by [volume]")).toEqual([
      { text: "…we do not ", match: false },
      { text: "price", match: true },
      { text: " by ", match: false },
      { text: "volume", match: true },
    ]);
  });

  it("returns a single plain run when nothing is marked", () => {
    expect(snippetRuns("plain text")).toEqual([{ text: "plain text", match: false }]);
    expect(snippetRuns("")).toEqual([]);
  });

  it("round-trips through serializeRuns", () => {
    const s = "a [b] c [d]";
    expect(serializeRuns(snippetRuns(s))).toBe(s);
  });
});

describe("matchRuns", () => {
  const text =
    "Open question on how limited endpoint visibility affects detection coverage during the pilot.";

  it("highlights whole words that start with a query term, case-insensitively", () => {
    const runs = matchRuns(text, "Endpoint detect");
    expect(runs.filter((r) => r.match).map((r) => r.text)).toEqual(["endpoint", "detection"]);
    expect(runs.map((r) => r.text).join("")).toBe(text);
  });

  it("does not match inside words", () => {
    expect(matchRuns("the endpoint", "point").some((r) => r.match)).toBe(false);
  });

  it("returns the clipped plain text when there is no match or no query", () => {
    expect(matchRuns(text, "zzz")).toEqual([{ text, match: false }]);
    expect(matchRuns(text, "")).toEqual([{ text, match: false }]);
    const long = "word ".repeat(60).trim();
    const runs = matchRuns(long, "", 40);
    expect(runs.at(-1)).toEqual({ text: "…", match: false });
    expect(runs.map((r) => r.text).join("").length).toBeLessThanOrEqual(41);
  });

  it("windows long text around the first match with ellipses on word boundaries", () => {
    const long = `${"alpha ".repeat(40)}pricing model ${"omega ".repeat(40)}`.trim();
    const runs = matchRuns(long, "pric", 60);
    expect(runs[0]).toEqual({ text: "…", match: false });
    expect(runs.at(-1)).toEqual({ text: "…", match: false });
    expect(runs.find((r) => r.match)).toEqual({ text: "pricing", match: true });
    const body = runs.map((r) => r.text).join("");
    expect(body.length).toBeLessThanOrEqual(62);
    expect(body).not.toMatch(/…alph[^a]/);
  });

  it("escapes regex metacharacters in terms", () => {
    expect(matchRuns("cost (net) 2x", "(net)").find((r) => r.match)).toEqual({
      text: "(net)",
      match: true,
    });
    expect(matchRuns("a+b c", "a+b").some((r) => r.match)).toBe(true);
    expect(matchRuns("axb", "a.b").some((r) => r.match)).toBe(false);
  });
});
