import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { meta } from "./schema";

export function getMeta(db: Db, key: string): string | null {
  return db.select({ value: meta.value }).from(meta).where(eq(meta.key, key)).get()?.value ?? null;
}

export function setMeta(db: Db, key: string, value: string): void {
  db.insert(meta)
    .values({ key, value })
    .onConflictDoUpdate({ target: meta.key, set: { value } })
    .run();
}

export function deleteMeta(db: Db, key: string): void {
  db.delete(meta).where(eq(meta.key, key)).run();
}
