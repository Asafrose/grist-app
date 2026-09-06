import { useLocalSearchParams } from "expo-router";
import { Meeting } from "@/screens/meeting";

export default function MeetingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Meeting id={id} />;
}
