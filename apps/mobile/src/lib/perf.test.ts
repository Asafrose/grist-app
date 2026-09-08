import { PERF_MARK_TTL_MS, PERF_RECENT_LIMIT, perf } from "@/lib/perf";

describe("perf", () => {
  let log: jest.SpyInstance;
  let now: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(console, "log").mockImplementation(() => {});
    now = jest.spyOn(performance, "now").mockReturnValue(0);
    perf.clear();
  });

  afterEach(() => {
    log.mockRestore();
    now.mockRestore();
    perf.clear();
  });

  it("logs the delta between a mark and its measure", () => {
    now.mockReturnValueOnce(1_000).mockReturnValueOnce(1_432);
    perf.mark("enter");
    expect(perf.measure("enter", "route push → mount")).toEqual({
      label: "route push → mount",
      ms: 432,
      at: expect.any(Number),
    });
    expect(log).toHaveBeenCalledWith("[perf] route push → mount: 432ms");
  });

  it("records each measure in the recent ring", () => {
    now.mockReturnValueOnce(0).mockReturnValueOnce(120);
    perf.mark("enter");
    perf.measure("enter", "route push → mount");
    expect(perf.recent()).toEqual([
      { label: "route push → mount", ms: 120, at: expect.any(Number) },
    ]);
  });

  it("hands out a copy of the ring", () => {
    now.mockReturnValueOnce(0).mockReturnValueOnce(1);
    perf.mark("enter");
    perf.measure("enter", "route push → mount");
    const taken = perf.recent();
    taken.push({ label: "forged", ms: 0, at: 0 });
    expect(perf.recent()).toHaveLength(1);
  });

  it("keeps the ring bounded, dropping the oldest samples", () => {
    for (let i = 0; i < PERF_RECENT_LIMIT + 5; i++) {
      now.mockReturnValueOnce(0).mockReturnValueOnce(i);
      perf.mark("tick");
      perf.measure("tick", `sample ${i}`);
    }
    const kept = perf.recent();
    expect(kept).toHaveLength(PERF_RECENT_LIMIT);
    expect(kept[0]?.label).toBe("sample 5");
    expect(kept.at(-1)?.label).toBe(`sample ${PERF_RECENT_LIMIT + 4}`);
  });

  it("drops a mark that went stale instead of timing an unrelated later event", () => {
    now.mockReturnValueOnce(0).mockReturnValueOnce(PERF_MARK_TTL_MS + 1);
    perf.mark("exit");
    expect(perf.measure("exit", "unrelated event")).toBeNull();
    expect(log).not.toHaveBeenCalled();
    expect(perf.recent()).toEqual([]);
  });

  it("does nothing when the mark is missing", () => {
    expect(perf.measure("never-marked", "nothing")).toBeNull();
    expect(log).not.toHaveBeenCalled();
    expect(perf.recent()).toEqual([]);
  });

  it("consumes the mark so a second measure is silent", () => {
    perf.mark("once");
    perf.measure("once", "first");
    expect(perf.measure("once", "second")).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("clearMarks drops pending marks but keeps the recorded samples", () => {
    now.mockReturnValueOnce(0).mockReturnValueOnce(5);
    perf.mark("kept");
    perf.measure("kept", "recorded");
    perf.mark("pending");
    perf.clearMarks();
    expect(perf.measure("pending", "never")).toBeNull();
    expect(perf.recent()).toHaveLength(1);
  });

  it("is reachable from a debugger in dev", () => {
    expect((globalThis as { gristPerf?: typeof perf }).gristPerf).toBe(perf);
  });
});
