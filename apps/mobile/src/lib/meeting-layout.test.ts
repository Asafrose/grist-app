import { act, renderHook } from "@testing-library/react-native";
import {
  type CollapseState,
  initialCollapse,
  isMiniPlayerVisible,
  meetingLayout,
  meetingLayoutStore,
  reduceScroll,
  useCollapsedMeeting,
  useIsCardCollapsed,
} from "@/lib/meeting-layout";

const CONTENT = 2400;
const VIEWPORT = 600;
const MAX = CONTENT - VIEWPORT;

type Kind = "drag" | "fling" | "auto";

const frame = (offset: number, kind: Kind = "drag", contentHeight = CONTENT) => ({
  offset,
  contentHeight,
  layoutHeight: VIEWPORT,
  dragging: kind === "drag",
  momentum: kind === "fling",
});

const run =
  (kind: Kind) =>
  (state: CollapseState, ...offsets: number[]): CollapseState =>
    offsets.reduce((s, offset) => reduceScroll(s, frame(offset, kind)), state);

const drag = run("drag");
const fling = run("fling");
const auto = run("auto");

const collapsedMidList = () => drag(initialCollapse, 20, 80, 400, 800);

beforeEach(() => {
  meetingLayout.reset();
});

describe("reduceScroll", () => {
  it("collapses once the reader is more than 40px down", () => {
    expect(drag(initialCollapse, 10, 40).collapsed).toBe(false);
    expect(drag(initialCollapse, 10, 41).collapsed).toBe(true);
  });

  it("stays collapsed while the reader keeps going down", () => {
    expect(collapsedMidList().collapsed).toBe(true);
  });

  it("stays collapsed however far the reader reads back up mid-list", () => {
    const state = collapsedMidList();
    expect(drag(state, 780, 750, 720, 700).collapsed).toBe(true);
    expect(drag(state, 760, 600, 400, 200, 100).collapsed).toBe(true);
  });

  it("expands when the reader drags the list back to the top", () => {
    expect(drag(collapsedMidList(), 8).collapsed).toBe(false);
  });

  it("expands when a fling coasts to the top", () => {
    const state = collapsedMidList();
    expect(fling(state, 600, 200, 0).collapsed).toBe(false);
  });

  it("stays collapsed when a fling stops short of the top", () => {
    const state = collapsedMidList();
    expect(fling(state, 600, 300, 200).collapsed).toBe(true);
  });

  it("ignores a landing at the top nobody scrolled to", () => {
    // Transcript follow's animated scrollToIndex, or the clamp that follows the card handing
    // its height back: neither says the reader wants the card again.
    const state = collapsedMidList();
    expect(auto(state, 0).collapsed).toBe(true);
    expect(auto(state, 0).last).toBe(0);
    expect(auto(state, 900).collapsed).toBe(true);
  });

  it("never changes state on the bounce at either end", () => {
    const atEnd = drag(collapsedMidList(), MAX - 40);
    expect(drag(atEnd, MAX - 1, MAX + 60, MAX + 20, MAX - 1).collapsed).toBe(true);

    const top = drag(initialCollapse, 200, 300);
    expect(reduceScroll(top, frame(-60)).collapsed).toBe(true);
  });

  it("never collapses during momentum", () => {
    expect(fling(initialCollapse, 100, 400, 900).collapsed).toBe(false);
    expect(auto(initialCollapse, 100, 400, 900).collapsed).toBe(false);
  });

  it("starts the next drag from where momentum left off", () => {
    const glided = fling(collapsedMidList(), 700, 60);
    expect(glided.last).toBe(60);
    expect(drag(glided, 40, 8).collapsed).toBe(false);
  });

  it("decides nothing from a repeated frame at the same offset", () => {
    const state = collapsedMidList();
    expect(drag(state, 800, 800, 800)).toEqual(state);
    const open = drag(initialCollapse, 20);
    expect(drag(open, 20, 20).collapsed).toBe(false);
  });

  it("reads direction from where the drag began, not from a stale offset", () => {
    // What expand-on-play leaves behind: expanded, but the list is still at 800.
    const reseeded: CollapseState = { collapsed: false, last: 800 };
    expect(drag(reseeded, 760, 700, 670).collapsed).toBe(false);
    expect(drag(reseeded, 840).collapsed).toBe(true);
  });

  it("keeps a list shorter than its viewport expanded, however hard it is bounced", () => {
    const bounce = (...offsets: number[]) =>
      offsets.reduce((s, offset) => reduceScroll(s, frame(offset, "drag", 400)), initialCollapse);
    expect(bounce(60, 120, 200, 400).collapsed).toBe(false);
    expect(bounce(-40, 200, 900, 200, -40).collapsed).toBe(false);
  });
});

describe("isMiniPlayerVisible", () => {
  it("stays hidden when nothing is playing", () => {
    expect(isMiniPlayerVisible(null, "/meeting/r1", "r1")).toBe(false);
  });

  it("shows away from the playing meeting", () => {
    expect(isMiniPlayerVisible("r1", "/search", null)).toBe(true);
    expect(isMiniPlayerVisible("r1", "/meeting/r2", null)).toBe(true);
  });

  it("hides on the playing meeting while its card is visible", () => {
    expect(isMiniPlayerVisible("r1", "/meeting/r1", null)).toBe(false);
    expect(isMiniPlayerVisible("r1", "/meeting/r1", "r2")).toBe(false);
  });

  it("shows on the playing meeting once its card is collapsed", () => {
    expect(isMiniPlayerVisible("r1", "/meeting/r1", "r1")).toBe(true);
  });
});

describe("meetingLayout", () => {
  it("tracks the collapsed meeting and clears it", async () => {
    const { result } = await renderHook(() => useCollapsedMeeting());
    expect(result.current).toBeNull();

    await act(async () => meetingLayout.setCollapsed("r1", true));
    expect(result.current).toBe("r1");

    await act(async () => meetingLayout.setCollapsed("r1", false));
    expect(result.current).toBeNull();

    await act(async () => meetingLayout.setCollapsed("r2", true));
    await act(async () => meetingLayout.reset());
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  it("leaves another meeting's state alone", () => {
    meetingLayout.setCollapsed("r1", true);
    meetingLayout.setCollapsed("r2", false);
    expect(meetingLayoutStore.getState().collapsedId).toBe("r1");
    meetingLayout.clear("r2");
    expect(meetingLayoutStore.getState().collapsedId).toBe("r1");
    meetingLayout.clear("r1");
    expect(meetingLayoutStore.getState().collapsedId).toBeNull();
  });

  it("reports collapse per meeting", async () => {
    const { result } = await renderHook(() => useIsCardCollapsed("r1"));
    expect(result.current).toBe(false);

    await act(async () => meetingLayout.setCollapsed("r2", true));
    expect(result.current).toBe(false);

    await act(async () => meetingLayout.setCollapsed("r1", true));
    expect(result.current).toBe(true);
  });
});
