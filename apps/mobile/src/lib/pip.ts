import { Alert } from "react-native";
import { playback } from "@/lib/player";

export async function startPictureInPicture() {
  try {
    await playback.startPictureInPicture();
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (__DEV__) console.warn(`[pip] startPictureInPicture rejected: ${reason}`);
    Alert.alert("Picture in picture unavailable", reason);
  }
}
