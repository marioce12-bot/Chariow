// Lecture paginée et stable pour les agrégats admin : toute erreur ou dépassement du
// plafond de sécurité échoue explicitement plutôt que de renvoyer un total partiel.
export async function readAllRows<T>(
  service: any,
  table: string,
  columns: string,
  options: { endAt?: string; filter?: (query: any) => any; maxPages?: number } = {},
): Promise<T[]> {
  const rows: T[] = [];
  const size = 1000;
  const maxPages = options.maxPages ?? 100;
  for (let page = 0; page < maxPages; page++) {
    let query = service.from(table).select(columns);
    if (options.endAt) query = query.lte("created_at", options.endAt);
    if (options.filter) query = options.filter(query);
    const { data, error } = await query
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * size, (page + 1) * size - 1);
    if (error || !Array.isArray(data)) throw new Error("admin_read_unavailable");
    rows.push(...(data as T[]));
    if (data.length < size) return rows;
  }
  throw new Error("admin_read_scan_limit");
}
