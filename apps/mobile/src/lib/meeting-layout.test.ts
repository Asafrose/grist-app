import { act, renderHook } from "@testing-library/react-native";
import {
  type CollapseState,
  beginDrag,
  COLLAPSE_AT,
  initialCollapse,
  isMiniPlayerVisible,
  meetingLayout,
  meetingLayoutStore,
  NEAR_TOP,
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
  it("collapses once the reader is past the collapse threshold", () => {
    expect(drag(initialCollapse, 10, COLLAPSE_AT).collapsed).toBe(false);
    expect(drag(initialCollapse, 10, COLLAPSE_AT + 1).collapsed).toBe(true);
  });

  it("keeps the collapse threshold clear of the expand band", () => {
    expect(COLLAPSE_AT).toBeGreaterThan(NEAR_TOP);
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

  it("expands as a fling arrives inside the near-top band", () => {
    const state = collapsedMidList();
    expect(fling(state, 600, 200, NEAR_TOP).collapsed).toBe(false);
    expect(fling(state, 600, 200, 44).collapsed).toBe(false);
  });

  it("expands as a slow drag crosses into the near-top band", () => {
    const state = collapsedMidList();
    expect(drag(state, 120, 90, 60, 46).collapsed).toBe(false);
  });

  it("stays collapsed when momentum stops just above the band", () => {
    const state = collapsedMidList();
    expect(fling(state, 600, 200, NEAR_TOP + 1).collapsed).toBe(true);
  });

  it("ignores a programmatic landing inside the band", () => {
    const state = collapsedMidList();
    expect(auto(state, 400, 46).collapsed).toBe(true);
    expect(auto(state, 400, 46).last).toBe(46);
  });

  it("never expands from a downward frame inside the band", () => {
    const state: CollapseState = { collapsed: true, last: 40, edge: false, atEnd: false };
    expect(drag(state, 46).collapsed).toBe(true);
    expect(drag(state, NEAR_TOP).collapsed).toBe(true);
  });

  it("holds still while a finger wobbles across the edge of the band", () => {
    const wobble = (state: CollapseState) => drag(state, 44, 46, 44, 46, 44, 46);
    expect(wobble({ collapsed: false, last: 45, edge: false, atEnd: false }).collapsed).toBe(false);

    // The first upward frame is the arrival, and nothing after it collapses again.
    const arrived = drag({ collapsed: true, last: 45, edge: false, atEnd: false }, 44);
    expect(arrived.collapsed).toBe(false);
    expect(wobble(arrived).collapsed).toBe(false);
  });

  it("stops reading intent from a gesture that has been at the end of the content", () => {
    // Replay of the Timeline tab on device: the fling reaches the end of a short content
    // height, bounces past it, and the list then walks back to the top on its own while the
    // content grows. None of that is the reader asking for the card.
    const short = (offset: number, kind: Kind) => frame(offset, kind, 1408);
    const replay = (state: CollapseState, kind: Kind, ...offsets: number[]) =>
      offsets.reduce((s, offset) => reduceScroll(s, short(offset, kind)), state);

    let state = replay(initialCollapse, "drag", 40, 120, 400, 700);
    expect(state.collapsed).toBe(true);
    state = replay(state, "fling", 561, 700, 786, 830, 937);
    state = replay(state, "drag", 869, 840, 813);
    state = replay(state, "fling", 787, 400, 120, 52, 37, 8, 0);
    expect(state.collapsed).toBe(true);

    // The next gesture speaks again.
    state = beginDrag(state, 0);
    expect(replay(state, "fling", 600, 200, 40).collapsed).toBe(false);
  });

  it("expands on a fling to the top that starts from rest at the bottom", () => {
    const short = (offset: number, kind: Kind) => frame(offset, kind, 1408);
    const resting = beginDrag({ collapsed: true, last: 806, edge: false, atEnd: false }, 808);
    const state = [808, 600, 300, 40].reduce(
      (s, offset) => reduceScroll(s, short(offset, "fling")),
      resting,
    );
    expect(state.collapsed).toBe(false);
  });

  it("mutes collapse as well as expand once the gesture is settling at the end", () => {
    // The Timeline tab case: the gesture settles against a short content height, which then
    // grows underneath it. The offsets that follow are layout, so they neither expand nor
    // collapse the card.
    const at = (offset: number, contentHeight: number) => frame(offset, "drag", contentHeight);
    const settled = [808, 830].reduce(
      (s, offset) => reduceScroll(s, at(offset, 1408)),
      beginDrag({ collapsed: false, last: 800, edge: false, atEnd: false }, 800),
    );
    expect(settled.edge).toBe(true);
    expect(settled.collapsed).toBe(false);
    expect(reduceScroll(settled, at(900, 3728)).collapsed).toBe(false);
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
    const reseeded: CollapseState = { collapsed: false, last: 800, edge: false, atEnd: false };
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
