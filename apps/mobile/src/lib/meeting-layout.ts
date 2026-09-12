import { create, useStore } from "zustand";

export type MeetingLayoutState = { collapsedId: string | null; fullscreen: boolean };

export type CollapseState = {
  collapsed: boolean;
  last: number;
  /** Latched once the running gesture is seen settling against the end of the content. */
  edge: boolean;
  /** Whether the previous frame of this gesture was at or past the end. */
  atEnd: boolean;
};

export type ScrollFrame = {
  offset: number;
  contentHeight: number;
  layoutHeight: number;
  /** True only between begin- and end-drag. */
  dragging: boolean;
  /** True while the list coasts after a fling. False for the animated `scrollToIndex` of transcript follow. */
  momentum: boolean;
};

export const TOP_AT = 8;
export const NEAR_TOP = 48;
/** Keeps the collapse threshold clear of the expand band, so a wobbling finger cannot toggle. */
export const COLLAPSE_GAP = 24;
export const COLLAPSE_AT = NEAR_TOP + COLLAPSE_GAP;
export const EDGE_EPSILON = 2;

export const initialCollapse: CollapseState = {
  collapsed: false,
  last: 0,
  edge: false,
  atEnd: false,
};

export const meetingLayoutStore = create<MeetingLayoutState>(() => ({
  collapsedId: null,
  fullscreen: false,
}));

export const useCollapsedMeeting = () => useStore(meetingLayoutStore, (s) => s.collapsedId);
export const useIsCardCollapsed = (id: string) =>
  useStore(meetingLayoutStore, (s) => s.collapsedId === id);
export const useFullscreenPresented = () => useStore(meetingLayoutStore, (s) => s.fullscreen);

export function reduceScroll(state: CollapseState, frame: ScrollFrame): CollapseState {
  "worklet";
  const { offset } = frame;
  const max = Math.max(0, frame.contentHeight - frame.layoutHeight);
  const gesture = frame.dragging || frame.momentum;
  const end = offset > max - EDGE_EPSILON;
  // Two frames pressed against the end, the second no further back than the first: the list
  // is settling there or bouncing past it, not being flung away from it. From that point the
  // gesture only records position — the offsets that follow belong to the bounce and to the
  // content growing under it, and on the Timeline tab they walk all the way to the top.
  const edge = state.edge || (end && state.atEnd && offset >= state.last);
  const track = { collapsed: state.collapsed, last: offset, edge, atEnd: end };

  // Offsets the reader did not produce — a programmatic scroll, or the clamp that follows a
  // layout change — say nothing about intent: they only record where the list sits.
  if (!gesture) return { collapsed: state.collapsed, last: offset, edge: false, atEnd: false };
  if (offset < 0) return { collapsed: state.collapsed, last: offset, edge, atEnd: false };
  if (end || edge) return track;
  // Arriving at the top, not sitting near it: a reader-driven frame still travelling up
  // inside the band is the list landing, so the card starts coming back with the gesture.
  if (offset <= TOP_AT || (offset <= NEAR_TOP && offset < state.last))
    return { collapsed: false, last: offset, edge, atEnd: false };
  if (!frame.dragging) return track;

  const delta = offset - state.last;
  if (delta > 0)
    return {
      collapsed: state.collapsed || offset > COLLAPSE_AT,
      last: offset,
      edge,
      atEnd: false,
    };
  return { collapsed: state.collapsed, last: offset, edge, atEnd: false };
}

export function beginDrag(state: CollapseState, offset: number): CollapseState {
  "worklet";
  return { collapsed: state.collapsed, last: offset, edge: false, atEnd: false };
}

export function isMiniPlayerVisible(
  playingId: string | null,
  pathname: string,
  collapsedId: string | null,
  fullscreen: boolean,
): boolean {
  if (!playingId || fullscreen) return false;
  if (pathname !== `/meeting/${playingId}`) return true;
  return collapsedId === playingId;
}

export const meetingLayout = {
  setCollapsed(id: string, collapsed: boolean) {
    const { collapsedId } = meetingLayoutStore.getState();
    const next = collapsed ? id : collapsedId === id ? null : collapsedId;
    if (next !== collapsedId) meetingLayoutStore.setState({ collapsedId: next });
  },
  clear(id: string) {
    if (meetingLayoutStore.getState().collapsedId === id)
      meetingLayoutStore.setState({ collapsedId: null });
  },
  setFullscreen(fullscreen: boolean) {
    if (meetingLayoutStore.getState().fullscreen !== fullscreen)
      meetingLayoutStore.setState({ fullscreen });
  },
  reset() {
    meetingLayoutStore.setState({ collapsedId: null, fullscreen: false });
  },
};
