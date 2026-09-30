import { storefrontUrl, type StorefrontRow } from "./service";

export function presentStorefront(row: StorefrontRow, stats?: { visits: number; buyClicks: number }) {
  return {
    id: row.id,
    storeId: row.store_id,
    slug: row.slug,
    url: storefrontUrl(row.slug),
    isPublished: row.is_published,
    isDisabledByAdmin: row.is_disabled_by_admin,
    config: row.config,
    stats,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
