import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "./paginated-query";

describe("fetchAllPages", () => {
  it("récupère toutes les pages jusqu’au lot incomplet", async () => {
    const fetchPage = vi.fn(async (from: number) => ({
      data: from === 0 ? Array.from({ length: 2 }, (_, index) => index) : [2],
      error: null,
    }));

    const result = await fetchAllPages(fetchPage, 2, 10);

    expect(result).toEqual({ rows: [0, 1, 2], error: null });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 3);
  });

  it("propage l’erreur de page au lieu de la masquer", async () => {
    const error = new Error("query failed");
    const fetchPage = vi.fn(async () => ({ data: null, error }));

    const result = await fetchAllPages(fetchPage, 1000, 20_000);

    expect(result).toEqual({ rows: [], error });
  });
  it("signale la couverture inconnue si le plafond est rempli", async () => {
    const result = await fetchAllPages(async () => ({ data: [1, 2], error: null }), 2, 2);
    expect(result.rows).toHaveLength(2);
    expect(result.error).toBeInstanceOf(Error);
  });
});
