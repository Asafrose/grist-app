import { clipKey, deepLinks, seekKey } from "@/lib/deep-links";

beforeEach(() => deepLinks.reset());

describe("deepLinks", () => {
  it("consumes a key once", () => {
    expect(deepLinks.consume(seekKey("route-1", 125))).toBe(true);
    expect(deepLinks.consume(seekKey("route-1", 125))).toBe(false);
  });

  it("treats a new value or a new route instance as a separate link", () => {
    deepLinks.consume(seekKey("route-1", 125));
    expect(deepLinks.consume(seekKey("route-1", 300))).toBe(true);
    expect(deepLinks.consume(seekKey("route-2", 125))).toBe(true);
  });

  it("keeps seek and clip keys apart", () => {
    expect(deepLinks.consume(seekKey("route-1", 4))).toBe(true);
    expect(deepLinks.consume(clipKey("route-1", "4"))).toBe(true);
  });

  it("forgets the oldest keys instead of growing without bound", () => {
    for (let i = 0; i < 200; i++) deepLinks.consume(seekKey(`route-${i}`, 1));
    expect(deepLinks.consume(seekKey("route-199", 1))).toBe(false);
    deepLinks.consume(seekKey("route-200", 1));
    expect(deepLinks.consume(seekKey("route-0", 1))).toBe(true);
  });
});
