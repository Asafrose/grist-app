import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { finalizeStatementsAfterExecute } from "@/lib/db/statements";

export function testDb(): Db {
  const db = drizzle(new Database(":memory:"), { schema, casing: "snake_case" });
  migrate(db, { migrationsFolder: path.join(__dirname, "../../drizzle") });
  return finalizeStatementsAfterExecute(db);
}
