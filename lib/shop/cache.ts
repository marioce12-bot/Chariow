import { revalidateTag } from "next/cache";

export const userStoreListTag = (userId: string) => `user-stores:${userId}`;
export const storefrontSettingsTag = (slug: string) => `shop-storefront:${slug}`;

export function invalidateUserStoreList(userId: string) {
  revalidateTag(userStoreListTag(userId));
}

export function invalidateStorefrontSettings(slug: string | null | undefined) {
  if (slug) revalidateTag(storefrontSettingsTag(slug));
}
