export type PageResult<T> = {
  data: T[] | null;
  error: unknown | null;
};

export type PaginatedResult<T> = {
  rows: T[];
  error: unknown | null;
};

/** Fetches every page up to maxRows and returns errors instead of hiding them. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
  pageSize = 1000,
  maxRows = 20_000,
): Promise<PaginatedResult<T>> {
  const rows: T[] = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await fetchPage(offset, Math.min(offset + pageSize - 1, maxRows - 1));
    if (error) return { rows, error };

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, error: null };
  }

  return { rows, error: new Error("Limite de lecture atteinte : résultat potentiellement incomplet") };
}
