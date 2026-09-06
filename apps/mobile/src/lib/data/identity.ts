import type { User } from "@grist/grain-api";
import { chooseMe } from "@/lib/me";
import { currentDb } from "./live";

export const identity = {
  choose: (user: Pick<User, "id" | "name" | "email">) => chooseMe(currentDb(), user),
};
