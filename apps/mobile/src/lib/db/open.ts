import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { openDatabaseSync } from "expo-sqlite";
import migrations from "../../../drizzle/migrations";
import type { Db } from "./index";
import * as schema from "./schema";
import { finalizeStatementsAfterExecute } from "./statements";

export const DB_NAME = "grist.db";

export async function openDb(name = DB_NAME): Promise<Db> {
  const db = finalizeStatementsAfterExecute(
    drizzle(
      openDatabaseSync(name, {
        enableChangeListener: true,
        finalizeUnusedStatementsBeforeClosing: false,
      }),
      { schema, casing: "snake_case" },
    ),
  );
  await migrate(db, migrations);
  return db;
}
