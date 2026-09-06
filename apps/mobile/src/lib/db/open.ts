import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { openDatabaseSync } from "expo-sqlite";
import migrations from "../../../drizzle/migrations";
import type { Db } from "./index";
import * as schema from "./schema";

export const DB_NAME = "grist.db";

export async function openDb(name = DB_NAME): Promise<Db> {
  const db = drizzle(openDatabaseSync(name, { enableChangeListener: true }), {
    schema,
    casing: "snake_case",
  });
  await migrate(db, migrations);
  return db;
}
