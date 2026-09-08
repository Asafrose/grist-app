import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export const haptics = {
  selection() {
    if (Platform.OS === "web") return;
    void Haptics.selectionAsync();
  },
  light() {
    if (Platform.OS === "web") return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
};
