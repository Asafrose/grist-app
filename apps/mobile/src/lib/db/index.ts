import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema";

export type Db = BaseSQLiteDatabase<"sync", unknown, typeof schema>;

export * from "./meta";
export * from "./recordings";
export * from "./schema";
export * from "./search";
export * from "./transcripts";
