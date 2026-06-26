import { useCallback, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export function toggleSortKey<K extends string>(
  current: { key: K; dir: SortDir } | null,
  key: K,
): { key: K; dir: SortDir } {
  if (current?.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: "asc" };
}

export function compareStrings(a: string, b: string, dir: SortDir): number {
  const r = a.localeCompare(b, "es", { sensitivity: "base" });
  return dir === "asc" ? r : -r;
}

export function compareNumbers(a: number, b: number, dir: SortDir): number {
  if (a === b) return 0;
  return dir === "asc" ? a - b : b - a;
}

export function compareDates(a: Date, b: Date, dir: SortDir): number {
  return compareNumbers(a.getTime(), b.getTime(), dir);
}

export function compareBooleans(a: boolean, b: boolean, dir: SortDir): number {
  return compareNumbers(a ? 1 : 0, b ? 1 : 0, dir);
}

export function useTableSort<K extends string, T>(
  rows: T[],
  defaultKey: K,
  defaultDir: SortDir = "desc",
  comparators: Record<K, (a: T, b: T, dir: SortDir) => number>,
) {
  const [sort, setSort] = useState<{ key: K; dir: SortDir }>({
    key: defaultKey,
    dir: defaultDir,
  });

  const toggle = useCallback((key: K) => {
    setSort((current) => {
      if (current.key === key) {
        return { key, dir: current.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  }, []);

  const sortedRows = useMemo(() => {
    const cmp = comparators[sort.key];
    if (!cmp) return rows;
    return [...rows].sort((a, b) => cmp(a, b, sort.dir));
  }, [comparators, rows, sort.dir, sort.key]);

  const dirFor = useCallback(
    (key: K): SortDir | null => (sort.key === key ? sort.dir : null),
    [sort],
  );

  return { sortedRows, toggle, dirFor, sort };
}
