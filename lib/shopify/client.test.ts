import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/shopify/credentials",()=>({getShopifyCredentials:vi.fn(async()=>({shop:"demo.myshopify.com",accessToken:"token",scopes:["read_products","read_orders"]}))}));
import {getShopifyProductSnapshot,getShopifySnapshot,ORDERS_QUERY} from "./client";
import {normalizeShopifySnapshot,shopifySaleRows} from "./analytics";
const response=(data:any)=>({ok:true,status:200,headers:new Headers(),json:async()=>({data})} as Response);
const empty=(key:string)=>({[key]:{edges:[],pageInfo:{hasNextPage:false,endCursor:null}}});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("Shopify safety and snapshot contract",()=>{
 it("does not request the removed referringSite field and queries journey attribution",()=>{expect(ORDERS_QUERY).not.toMatch(/\breferringSite\b|\blandingPageUrl\b/);expect(ORDERS_QUERY).toContain("customerJourneySummary");expect(ORDERS_QUERY).toContain("utmParameters");});
 it("reads shop metadata and reads paginated products and orders",async()=>{const f=vi.fn(async (_url:any,init:any)=>{const body=JSON.parse(init.body);if(body.query.includes("query Products"))return response(empty("products"));if(body.query.includes("query Orders"))return response(empty("orders"));return response({shop:{name:"Demo",currencyCode:"EUR"}});});vi.stubGlobal("fetch",f);const s=await getShopifySnapshot({id:"s"});expect(s.store.name).toBe("Demo");expect(s.store.currencyCode).toBe("EUR");expect(s.coverage.sales.complete).toBe(true);expect(f).toHaveBeenCalledTimes(3);});
 it.each(["2026-02-30","2026-01-01T00:00:00Z","2026-1-01"]) ("rejects invalid from date %s before making requests",async from=>{const f=vi.fn();vi.stubGlobal("fetch",f);await expect(getShopifySnapshot({id:"s"},{from})).rejects.toThrow(/Date from invalide/);expect(f).not.toHaveBeenCalled();});
 it("rejects reverse date range",async()=>{vi.stubGlobal("fetch",vi.fn());await expect(getShopifySnapshot({id:"s"},{from:"2026-10-02",to:"2026-10-01"})).rejects.toThrow(/antérieure/);});
 it("blocks untrusted hosts before network and disables redirects",async()=>{const {getShopifyCredentials}=await import("@/lib/shopify/credentials");vi.mocked(getShopifyCredentials).mockResolvedValueOnce({shop:"127.0.0.1",accessToken:"t"} as any);const f=vi.fn();vi.stubGlobal("fetch",f);await expect(getShopifyProductSnapshot({id:"s"})).rejects.toThrow(/Hôte Shopify invalide/);expect(f).not.toHaveBeenCalled();});
 it("catalogue-only mode never issues an order query",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(response(empty("products"))).mockResolvedValueOnce(response({shop:{name:"Demo"}})));const s=await getShopifyProductSnapshot({id:"s"});expect(s.sales.data).toEqual([]);expect(s.coverage.sales.complete).toBe(false);expect(vi.mocked(fetch).mock.calls.some(c=>String(c[1]?.body).includes("query Orders"))).toBe(false);});
 it("computes paid and partially-refunded value from original total minus refund",()=>{const n=normalizeShopifySnapshot({store:{id:"S"},sales:{data:[{id:"gid://shopify/Order/1",displayFinancialStatus:"PARTIALLY_REFUNDED",totalPriceSet:{shopMoney:{amount:"25",currencyCode:"EUR"}},currentTotalPriceSet:{shopMoney:{amount:"7"}},totalRefundedSet:{shopMoney:{amount:"4"}}}]}});expect(n.sales[0]).toMatchObject({amount:21,refund_amount:4,net_amount:null,status:"paid",original_financial_status:"partially_refunded"});});
 it("fully refunded order has zero amount and excluded from sales KPIs",()=>{const n=normalizeShopifySnapshot({store:{id:"S"},sales:{data:[{id:"1",displayFinancialStatus:"REFUNDED",totalPriceSet:{shopMoney:{amount:"50",currencyCode:"EUR"}},totalRefundedSet:{shopMoney:{amount:"50"}}}]}});expect(n.sales[0]).toMatchObject({status:"refunded",amount:0});expect(n.kpis.sales).toBe(0);});
 it("excludes cancelled and test orders without invented negative sales",()=>{const n=normalizeShopifySnapshot({store:{id:"S"},sales:{data:[{id:"1",displayFinancialStatus:"PAID",cancelledAt:"x",totalPriceSet:{shopMoney:{amount:"10"}}},{id:"2",displayFinancialStatus:"PAID",test:true,totalPriceSet:{shopMoney:{amount:"20"}}}]}});expect(n.sales.map((x:any)=>x.amount)).toEqual([null,null]);expect(n.kpis.sales).toBe(0);});
 it("uses discounted extended line value and nulls amounts where refunds make allocation unknown",()=>{const sale={id:"3",displayFinancialStatus:"PAID",totalPriceSet:{shopMoney:{amount:"18",currencyCode:"EUR"}},lineItems:{edges:[{node:{quantity:2,discountedTotalSet:{shopMoney:{amount:"18"}},product:{id:"gid://shopify/Product/4"}}}],pageInfo:{hasNextPage:false}}};const n=normalizeShopifySnapshot({store:{id:"S"},sales:{data:[sale]}});expect((n.sales[0] as any).line_items[0]).toMatchObject({product_id:"4",amount:18,unit_price:9});sale.displayFinancialStatus="PARTIALLY_REFUNDED";(sale as any).totalRefundedSet={shopMoney:{amount:"1"}};const r=normalizeShopifySnapshot({store:{id:"S"},sales:{data:[sale]}});expect((r.sales[0] as any).line_items[0].amount).toBeNull();});
 it("handles line item pagination as incomplete and does not claim precise line sales",()=>{const n=normalizeShopifySnapshot({store:{id:"S"},sales:{data:[{id:"4",displayFinancialStatus:"PAID",lineItems:{edges:[{node:{quantity:1,product:{id:"gid://shopify/Product/5"}}}],pageInfo:{hasNextPage:true}}}]}});expect((n.sales[0] as any).line_items).toEqual([]);});
 it("extracts journey UTM and landing/referrer without exposing order PII",()=>{const n=normalizeShopifySnapshot({store:{id:"S"},sales:{data:[{id:"gid://shopify/Order/6",email:"private@example.com",displayFinancialStatus:"PAID",customerJourneySummary:{lastVisit:{landingPage:"/x",referrerUrl:"https://source",utmParameters:{campaign:"c",source:"s",medium:"m",content:"a",term:"b"}}}}]}});expect(n.sales[0]).toMatchObject({utm_campaign:"c",utm_source:"s",utm_medium:"m",utm_content:"a",utm_term:"b",landing_page_url:"/x",referring_site:"https://source"});expect((n.sales[0] as any).raw_payload).not.toHaveProperty("email");});
 it("uses snapshot period and persists store-scoped identifiers with safe metadata",()=>{const n=normalizeShopifySnapshot({store:{id:"S"},period:{from:"a",to:"b"},sales:{data:[{id:"gid://shopify/Order/7",displayFinancialStatus:"PAID"}]}});expect(n.kpis.period).toEqual({from:"a",to:"b"});const [row]=shopifySaleRows("store-db-id",n.sales);expect(row.chariow_sale_id).toBe("shopify:store-db-id:7");expect(row.raw_payload).not.toHaveProperty("email");});
 it("marks requested periods older than default 60 days explicitly",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({products:empty("products").products,orders:empty("orders").orders,shop:{}})));const s=await getShopifySnapshot({id:"s"},{from:"2020-01-01",to:"2020-02-01"});expect(s.coverage.sales.reason).toMatch(/dépasse la couverture par défaut de 60 jours/);expect(s.coverage.sales.complete).toBe(false);});
 it("surfaces protected orders access failures",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,status:200,headers:new Headers(),json:async()=>({errors:[{message:"Access denied for orders field (read_orders)"}]})}));await expect(getShopifySnapshot({id:"x"})).rejects.toThrow(/données protégées/);});
});

describe("Shopify GraphQL cost budget", () => {
  it("reduces the page size after MAX_COST_EXCEEDED without losing the cursor", async () => {
    const sizes: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: any) => {
      const body = JSON.parse(init.body);
      if (body.query.includes("query Shop")) return response({ shop: {} });
      if (body.query.includes("query Products")) return response(empty("products"));
      sizes.push(body.variables.first);
      if (body.variables.first > 25) return { ok: true, status: 200, headers: new Headers(), json: async () => ({ errors: [{ message: "Query cost exceeds the maximum cost", extensions: { code: "MAX_COST_EXCEEDED" } }] }) } as Response;
      return response(empty("orders"));
    }));
    const result = await getShopifySnapshot({ id: "cost-test" });
    expect(sizes).toEqual([100, 50, 25]);
    expect(result.coverage.sales.complete).toBe(true);
  });
});
