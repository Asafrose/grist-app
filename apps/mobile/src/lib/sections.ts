import { formatDayLabel } from "@/lib/format";

export type DayItem<T> =
  | { kind: "header"; key: string; label: string }
  | { kind: "row"; key: string; item: T; last: boolean };

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function groupByDay<T extends { id: string; startDatetime: string }>(
  rows: readonly T[],
  now = new Date(),
): DayItem<T>[] {
  const items: DayItem<T>[] = [];
  let current: string | null = null;
  rows.forEach((row, i) => {
    const key = dayKey(row.startDatetime);
    if (key !== current) {
      current = key;
      items.push({
        kind: "header",
        key: `h:${key}`,
        label: formatDayLabel(row.startDatetime, now),
      });
    }
    const next = rows[i + 1];
    items.push({
      kind: "row",
      key: row.id,
      item: row,
      last: !next || dayKey(next.startDatetime) !== key,
    });
  });
  return items;
}

export function headerIndices<T>(items: readonly DayItem<T>[]): number[] {
  return items.flatMap((it, i) => (it.kind === "header" ? [i] : []));
}
