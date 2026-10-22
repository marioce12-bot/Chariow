import { getShopifyCredentials } from "@/lib/shopify/credentials";
export const SHOPIFY_API_VERSION = "2026-10";
const PAGE_SIZE = 100,
  MAX_PAGES = 20,
  TIMEOUT_MS = 15_000;
type Store = { id: string; [key: string]: unknown };
type Options = { from?: string; to?: string; catalogOnly?: boolean };
type Coverage = {
  complete: boolean;
  fetched: number;
  pages: number;
  reason: string | null;
};
type Connection = {
  edges: Array<{ cursor: string; node: Record<string, any> }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};
export const PRODUCT_QUERY = `query Products($first:Int!,$after:String){products(first:$first,after:$after){edges{cursor node{id title descriptionHtml handle status createdAt featuredImage{url} priceRangeV2{minVariantPrice{amount currencyCode}} onlineStoreUrl}} pageInfo{hasNextPage endCursor}}}`;
export const SHOP_QUERY = `query Shop { shop { name currencyCode primaryDomain { url } } }`;
export const ORDERS_QUERY = `query Orders($first:Int!,$after:String,$query:String!){orders(first:$first,after:$after,query:$query,sortKey:CREATED_AT,reverse:true){edges{cursor node{id name createdAt cancelledAt test displayFinancialStatus currencyCode totalPriceSet{shopMoney{amount currencyCode}} totalRefundedSet{shopMoney{amount currencyCode}} lineItems(first:100){edges{node{title quantity product{id title handle featuredImage{url} onlineStoreUrl} variant{product{id title handle featuredImage{url} onlineStoreUrl}} discountedTotalSet{shopMoney{amount currencyCode}} originalUnitPriceSet{shopMoney{amount currencyCode}}}} pageInfo{hasNextPage endCursor}} customerJourneySummary{firstVisit{landingPage referrerUrl utmParameters{campaign source medium content term}} lastVisit{landingPage referrerUrl utmParameters{campaign source medium content term}}}}} pageInfo{hasNextPage endCursor}}}`;
function validateShop(value: string): string {
  const host = value.includes(".") ? value : `${value}.myshopify.com`;
  if (
    host.length > 253 ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) ||
    host.includes("..") ||
    !/^(?:[a-z0-9-]+\.)*myshopify\.com$/.test(host)
  )
    throw new Error("Hôte Shopify invalide.");
  return host;
}
function validDate(v: string | undefined, label: string): string | undefined {
  if (v === undefined) return;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(`${v}T00:00:00Z`)) ||
    new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v
  )
    throw new Error(`Date ${label} invalide (format YYYY-MM-DD requis).`);
  return v;
}
async function request(
  shop: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
  signal: AbortSignal,
) {
  const host = validateShop(shop),
    response = await fetch(
      `https://${host}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query, variables }),
      },
    );
  if (response.status === 429 || response.status >= 500)
    throw Object.assign(new Error(`Shopify HTTP ${response.status}`), {
      retryable: true,
      retryAfter: Number(response.headers.get("Retry-After")),
    });
  if (!response.ok)
    throw new Error(`Shopify Admin API HTTP ${response.status}`);
  const body = (await response.json()) as {
    data?: Record<string, any>;
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
  };
  if (body.errors?.length) {
    const message = body.errors.map((e) => e.message).join("; ");
    if (
      body.errors.some(
        (e) =>
          e.extensions?.code === "THROTTLED" ||
          /throttl|rate limit/i.test(e.message),
      )
    )
      throw Object.assign(
        new Error(`Shopify GraphQL rate limited: ${message}`),
        { retryable: true },
      );
    if (/ACCESS_DENIED|protected customer|scope|orders/i.test(message))
      throw new Error(
        `Accès Shopify aux commandes refusé (read_orders requis; accès aux données protégées potentiellement soumis à approbation Shopify) : ${message}`,
      );
    throw new Error(`Erreur GraphQL Shopify : ${message}`);
  }
  return body.data ?? {};
}
async function call(
  shop: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await request(shop, token, query, variables, controller.signal);
    } catch (e) {
      if (attempt >= 2 || !(e as any)?.retryable) {
        if ((e as any)?.name === "AbortError")
          throw new Error("Timeout Shopify après 15 secondes");
        throw e;
      }
      await new Promise((r) =>
        setTimeout(
          r,
          Math.max(250, Math.min(5000, ((e as any).retryAfter || 1) * 1000)),
        ),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
async function collect(
  shop: string,
  token: string,
  query: string,
  key: string,
  extra: Record<string, unknown> = {},
) {
  const data: Record<string, any>[] = [],
    seen = new Set<string>();
  let after: string | null = null,
    pages = 0, first = PAGE_SIZE;
  for (; pages < MAX_PAGES;) {
    let response: Record<string, any>;
    try {
      response = await call(shop, token, query, { first, after, ...extra });
    } catch (error) {
      if (first > 1 && /MAX_COST_EXCEEDED|cost.*exceed|exceed.*cost/i.test(error instanceof Error ? error.message : "")) {
        first = Math.max(1, Math.floor(first / 2));
        continue;
      }
      throw error;
    }
    const conn = response[key] as Connection;
    pages++;
    if (!conn)
      return {
        data,
        coverage: {
          complete: false,
          fetched: data.length,
          pages,
          reason: `Réponse Shopify sans collection ${key}.`,
        } satisfies Coverage,
      };
    for (const edge of conn.edges ?? [])
      if (edge.node?.id && !seen.has(edge.node.id)) {
        seen.add(edge.node.id);
        data.push(edge.node);
      }
    if (!conn.pageInfo?.hasNextPage)
      return {
        data,
        coverage: {
          complete: true,
          fetched: data.length,
          pages,
          reason: null,
        } satisfies Coverage,
      };
    const cursor = conn.pageInfo.endCursor;
    if (!cursor || cursor === after)
      return {
        data,
        coverage: {
          complete: false,
          fetched: data.length,
          pages,
          reason: "Curseur Shopify absent ou répété.",
        } satisfies Coverage,
      };
    after = cursor;
  }
  return {
    data,
    coverage: {
      complete: false,
      fetched: data.length,
      pages,
      reason: `Limite de ${MAX_PAGES} pages atteinte (${first} éléments par page après adaptation au coût Shopify).`,
    } satisfies Coverage,
  };
}
export async function getShopifyProductSnapshot(store: Store) {
  const credentials = await getShopifyCredentials(store.id);
  if (!credentials?.shop || !credentials.accessToken)
    throw new Error("Aucun accès Shopify valide pour cette boutique.");
  const products = await collect(
    credentials.shop,
    credentials.accessToken,
    PRODUCT_QUERY,
    "products",
  );
  let shopData: Record<string, any> = {};
  try {
    shopData =
      (await call(credentials.shop, credentials.accessToken, SHOP_QUERY, {}))
        .shop ?? {};
  } catch {
    /* catalog remains usable even if optional shop metadata is unavailable */
  }
  return {
    store: {
      ...store,
      shop: credentials.shop,
      name: shopData.name,
      currencyCode: shopData.currencyCode,
      primaryDomain: shopData.primaryDomain,
    },
    products: { data: products.data },
    sales: { data: [] },
    coverage: {
      products: products.coverage,
      sales: {
        complete: false,
        fetched: 0,
        pages: 0,
        reason: "Catalogue uniquement : commandes non chargées.",
      },
    },
    period: null as null,
  };
}
export async function getShopifySnapshot(store: Store, options: Options = {}) {
  const credentials = await getShopifyCredentials(store.id);
  if (!credentials?.shop || !credentials.accessToken)
    throw new Error("Aucun accès Shopify valide pour cette boutique.");
  const from =
      validDate(options.from, "from") ??
      new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10),
    to = validDate(options.to, "to") ?? new Date().toISOString().slice(0, 10);
  if (from > to)
    throw new Error("La date from doit être antérieure ou égale à to.");
  const query = `created_at:>=${from} created_at:<=${to}`;
  const [products, orders, shopResult] = await Promise.all([
    collect(
      credentials.shop,
      credentials.accessToken,
      PRODUCT_QUERY,
      "products",
    ),
    collect(credentials.shop, credentials.accessToken, ORDERS_QUERY, "orders", {
      query,
    }),
    call(credentials.shop, credentials.accessToken, SHOP_QUERY, {}),
  ]);
  const shopData = shopResult.shop ?? {};
  const olderThanDefault =
    from < new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  return {
    store: {
      ...store,
      shop: credentials.shop,
      name: shopData.name,
      currencyCode: shopData.currencyCode,
      primaryDomain: shopData.primaryDomain,
    },
    products: { data: products.data },
    sales: { data: orders.data },
    coverage: {
      products: products.coverage,
      sales: olderThanDefault
        ? {
            ...orders.coverage,
            complete: false,
            reason: [
              orders.coverage.reason,
              "La plage demandée dépasse la couverture par défaut de 60 jours; vérifiez l'accès read_orders et la complétude Shopify.",
            ]
              .filter(Boolean)
              .join(" "),
          }
        : orders.coverage,
    },
    period: { from, to },
  };
}
export type { Coverage as ShopifyCollectionCoverage };
