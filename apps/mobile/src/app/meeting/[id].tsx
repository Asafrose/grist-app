import { useLocalSearchParams } from "expo-router";
import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function MeetingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderScreen title="Meeting" note={`Recording ${id}`} />;
}
