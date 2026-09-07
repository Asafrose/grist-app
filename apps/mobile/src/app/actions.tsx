import { useLocalSearchParams } from "expo-router";
import { Actions } from "@/screens/actions";

export default function ActionsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Actions id={id} />;
}
