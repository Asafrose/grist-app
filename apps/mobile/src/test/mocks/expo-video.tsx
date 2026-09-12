import { PureComponent } from "react";
import { View } from "react-native";

export const createVideoPlayer = jest.fn(() => {
  const listeners = new Map<string, (payload: never) => void>();
  return {
    listeners,
    emit: (name: string, payload: never) => listeners.get(name)?.(payload),
    muted: false,
    preservesPitch: false,
    playbackRate: 1,
    addListener: jest.fn((name: string, fn: (payload: never) => void) => listeners.set(name, fn)),
    removeListener: jest.fn((name: string) => listeners.delete(name)),
    replaceAsync: jest.fn(async () => {}),
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
  };
});

export const videoViewPictureInPicture = jest.fn(async () => {});

export class VideoView extends PureComponent<object> {
  startPictureInPicture = videoViewPictureInPicture;
  render() {
    return <View testID="video-view" {...this.props} />;
  }
}

export const isPictureInPictureSupported = () => true;
