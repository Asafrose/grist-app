import { PureComponent } from "react";
import { View } from "react-native";

export const videoPlayers: MockVideoPlayer[] = [];

export const videoPlayerDefaults = { bufferedPosition: 0, duration: 0 };

export type MockVideoPlayer = {
  bufferedPosition: number;
  duration: number;
  muted: boolean;
  bufferOptions: { preferredForwardBufferDuration?: number };
  addListener: jest.Mock;
  emit: (event: string, payload: unknown) => void;
  replaceAsync: jest.Mock;
  play: jest.Mock;
  pause: jest.Mock;
  release: jest.Mock;
};

export const createVideoPlayer = jest.fn((): MockVideoPlayer => {
  const listeners = new Map<string, ((payload: unknown) => void)[]>();
  const player: MockVideoPlayer = {
    bufferedPosition: videoPlayerDefaults.bufferedPosition,
    duration: videoPlayerDefaults.duration,
    muted: false,
    bufferOptions: {},
    addListener: jest.fn((event: string, fn: (payload: unknown) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn]);
      return {
        remove: () =>
          listeners.set(
            event,
            (listeners.get(event) ?? []).filter((f) => f !== fn),
          ),
      };
    }),
    emit: (event, payload) => {
      for (const fn of listeners.get(event) ?? []) fn(payload);
    },
    replaceAsync: jest.fn(async () => {}),
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
  };
  videoPlayers.push(player);
  return player;
});

export const setVideoCacheSizeAsync = jest.fn(async () => {});
export const clearVideoCacheAsync = jest.fn(async () => {});
export const getCurrentVideoCacheSize = jest.fn(() => 0);

export const videoViewPictureInPicture = jest.fn(async () => {});

export class VideoView extends PureComponent<object> {
  startPictureInPicture = videoViewPictureInPicture;
  render() {
    return <View testID="video-view" {...this.props} />;
  }
}

export const isPictureInPictureSupported = () => true;
