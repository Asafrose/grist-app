import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { RecordingDetail } from "@/lib/data";

type ScrollEvent = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

export type ScrollListeners = {
  onScroll: ScrollEvent;
  onScrollBeginDrag: ScrollEvent;
  onScrollEndDrag: ScrollEvent;
  onMomentumScrollBegin: ScrollEvent;
  onMomentumScrollEnd: ScrollEvent;
};

export type TabProps = {
  rec: RecordingDetail;
  onSeek: (ms: number) => void;
  onPlay?: () => void;
  /** Keeps the scrollable range constant while the player card is collapsed. */
  contentInsetBottom?: number;
  scrollListeners?: ScrollListeners;
  /** Called before an animated `scrollToIndex`, so the frames it emits are not read as a fling. */
  onProgrammaticScroll?: () => void;
};
