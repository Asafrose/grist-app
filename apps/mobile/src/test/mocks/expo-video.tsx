import { PureComponent } from "react";
import { View } from "react-native";

export const createVideoPlayer = jest.fn(() => ({
  addListener: jest.fn(),
  replaceAsync: jest.fn(async () => {}),
  play: jest.fn(),
  pause: jest.fn(),
}));

export const videoViewPictureInPicture = jest.fn(async () => {});

export class VideoView extends PureComponent<object> {
  startPictureInPicture = videoViewPictureInPicture;
  render() {
    return <View testID="video-view" {...this.props} />;
  }
}

export const isPictureInPictureSupported = () => true;
