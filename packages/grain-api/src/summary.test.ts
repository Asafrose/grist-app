import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { splitSummarySections, timestampsToMs } from "./summary";

describe("summary helpers", () => {
  it("splits the summary markdown into ## sections", () => {
    const rec = JSON.parse(
      readFileSync(new URL("../fixtures/recording.json", import.meta.url), "utf8"),
    );
    const sections = splitSummarySections(rec.ai_summary.text);
    expect(sections.length).toBeGreaterThan(1);
    expect(sections[0].title).toBeTypeOf("string");
    expect(sections.every((s) => s.markdown.length > 0)).toBe(true);
  });

  it("treats text before the first heading as Summary", () => {
    expect(splitSummarySections("- a\n- b\n## Next\n- c")).toEqual([
      { title: "Summary", markdown: "- a\n- b" },
      { title: "Next", markdown: "- c" },
    ]);
  });

  it("parses m:ss and h:mm:ss timestamps to milliseconds", () => {
    expect(timestampsToMs("at 1:28 and 42:12, then 1:02:03")).toEqual([88000, 2532000, 3723000]);
    expect(timestampsToMs("no times here")).toEqual([]);
  });
});
