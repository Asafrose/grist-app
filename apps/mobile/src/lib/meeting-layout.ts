import { create, useStore } from "zustand";

export type MeetingLayoutState = { collapsedId: string | null };

export type CollapseState = { collapsed: boolean; last: number; up: number };

export type ScrollFrame = {
  offset: number;
  contentHeight: number;
  layoutHeight: number;
  /**
   * True only between begin- and end-drag. Nothing else decides: momentum frames and the
   * animated `scrollToIndex` of transcript follow are indistinguishable at this level.
   */
  dragging: boolean;
};

export const COLLAPSE_AT = 40;
export const TOP_AT = 8;
export const EXPAND_TRAVEL = 120;
export const EDGE_EPSILON = 2;

export const initialCollapse: CollapseState = { collapsed: false, last: 0, up: 0 };

export const meetingLayoutStore = create<MeetingLayoutState>(() => ({ collapsedId: null }));

export const useCollapsedMeeting = () => useStore(meetingLayoutStore, (s) => s.collapsedId);
export const useIsCardCollapsed = (id: string) =>
  useStore(meetingLayoutStore, (s) => s.collapsedId === id);

export function reduceScroll(state: CollapseState, frame: ScrollFrame): CollapseState {
  "worklet";
  const { offset } = frame;
  const max = Math.max(0, frame.contentHeight - frame.layoutHeight);
  const track = { collapsed: state.collapsed, last: offset, up: 0 };

  // Offsets the reader did not produce — a fling, a programmatic scroll, or the clamp that
  // follows a layout change — say nothing about intent: they only record where the list sits.
  if (!frame.dragging) return track;
  if (offset <= TOP_AT && offset >= 0) return { collapsed: false, last: offset, up: 0 };
  if (offset < 0 || offset > max - EDGE_EPSILON) return track;

  const delta = offset - state.last;
  if (delta > 0) {
    return { collapsed: state.collapsed || offset > COLLAPSE_AT, last: offset, up: 0 };
  }
  if (delta === 0) return state;

  const up = state.up - delta;
  if (state.collapsed && up >= EXPAND_TRAVEL) return { collapsed: false, last: offset, up: 0 };
  return { collapsed: state.collapsed, last: offset, up };
}

export function isMiniPlayerVisible(
  playingId: string | null,
  pathname: string,
  collapsedId: string | null,
): boolean {
  if (!playingId) return false;
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
  reset() {
    meetingLayoutStore.setState({ collapsedId: null });
  },
};
