import { Platform, Share } from "react-native";

export function shareLink(url: string, title: string) {
  void Share.share(Platform.OS === "ios" ? { url, message: title } : { message: url }, {
    dialogTitle: title,
  }).catch(() => undefined);
}
