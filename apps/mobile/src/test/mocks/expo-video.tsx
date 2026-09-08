import { View } from "react-native";

export const createVideoPlayer = jest.fn(() => ({
  addListener: jest.fn(),
  replaceAsync: jest.fn(async () => {}),
  play: jest.fn(),
  pause: jest.fn(),
}));

export const VideoView = (props: object) => <View testID="video-view" {...props} />;

export const isPictureInPictureSupported = () => true;
