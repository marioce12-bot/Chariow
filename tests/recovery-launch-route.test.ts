import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),from:vi.fn(),admin:vi.fn(),catalog:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireUser:mocks.auth}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.admin}));
vi.mock("@/lib/chariow/product-links",async original=>({...await original<typeof import("@/lib/chariow/product-links")>(),loadRecoveryProducts:mocks.catalog}));
import {POST} from "@/app/api/recovery/launch/route";
const storeId="11111111-1111-4111-8111-111111111111";
const sale={chariow_sale_id:"sale-1",status:"abandoned",amount:1000,currency:"XOF",occurred_at:new Date(Date.now()-864e5).toISOString(),raw_payload:{customer:{name:"Client démo",phone:{number:"2290100000000",country:{dial_code:"229"}}},product:{id:"prd_demo",name:"Guide démo"}}};
const store={id:storeId,store_name:"Démo",mcp_url:"https://mcp.example",access_token_encrypted:null};
let q:any;
function req(extra:Record<string,unknown>={}){return new Request("https://app.example/api/recovery/launch",{method:"POST",body:JSON.stringify({storeId,sourceSaleId:"sale-1",consent:true,...extra})});}
beforeEach(()=>{
 vi.clearAllMocks();
 q={}; for(const key of ["select","eq","in","or","insert","update"])q[key]=vi.fn(()=>q);
 q.maybeSingle=vi.fn().mockResolvedValueOnce({data:store,error:null}).mockResolvedValueOnce({data:sale,error:null}).mockResolvedValueOnce({data:null,error:null});
 q.limit=vi.fn().mockResolvedValue({data:[],error:null});q.single=vi.fn().mockResolvedValue({data:{id:"case-1"},error:null});
 mocks.from.mockReturnValue(q);mocks.admin.mockReturnValue({from:mocks.from});mocks.auth.mockResolvedValue({user:{id:"owner"},supabase:{from:mocks.from}});
 mocks.catalog.mockResolvedValue([{id:"prd_demo",name:"Guide démo",url:"https://shop.example/prd_demo"}]);
});
describe("direct WhatsApp recovery launch",()=>{
 it("requires authentication and explicit consent",async()=>{
  mocks.auth.mockResolvedValueOnce({user:null,response:new Response("Unauthorized",{status:401})});
  expect((await POST(req())).status).toBe(401);
  expect((await POST(req({consent:false}))).status).toBe(400);
  expect(mocks.from).not.toHaveBeenCalled();
 });
 it("checks ownership and sale scoping on the server",async()=>{
  q.maybeSingle.mockReset().mockResolvedValueOnce({data:null,error:null});
  expect((await POST(req())).status).toBe(404);expect(q.eq).toHaveBeenCalledWith("user_id","owner");expect(q.insert).not.toHaveBeenCalled();
 });
 it("derives contact and URL server-side, ignores forged data and never marks sent",async()=>{
  const result=await POST(req({phone:"+19999999999",paymentUrl:"https://evil.example",status:"sent"}));const data=await result.json();
  expect(result.status).toBe(201);expect(data.url).toContain("https://wa.me/2290100000000?");expect(data.delivery).toBe("manual");
  expect(data.message).toContain("https://shop.example/prd_demo");expect(data.message).toContain("STOP");expect(data.message).not.toContain("evil.example");
  expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({phone:"+2290100000000",source_sale_id:"sale-1",status:"prepared",payment_url:"https://shop.example/prd_demo"}));
  expect(q.insert.mock.calls[0][0]).not.toHaveProperty("sent_at");expect(q.eq).toHaveBeenCalledWith("store_id",storeId);expect(q.eq).toHaveBeenCalledWith("chariow_sale_id","sale-1");
 });
 it("blocks paid or stale sales before preparing a message",async()=>{
  q.maybeSingle.mockReset().mockResolvedValueOnce({data:store}).mockResolvedValueOnce({data:{...sale,status:"completed"}});
  expect((await POST(req())).status).toBe(409);expect(q.insert).not.toHaveBeenCalled();
 });
 it("rejects sales outside the thirty-day recovery window",async()=>{
  q.maybeSingle.mockReset().mockResolvedValueOnce({data:store}).mockResolvedValueOnce({data:{...sale,occurred_at:"2020-01-01T00:00:00Z"}});
  expect((await POST(req())).status).toBe(409);expect(q.insert).not.toHaveBeenCalled();
 });
 it("honors previous opt-outs",async()=>{
  q.limit.mockResolvedValueOnce({data:[{id:"opted"}],error:null});expect((await POST(req())).status).toBe(403);expect(q.insert).not.toHaveBeenCalled();
 });
 it("does not invent product links when the catalog has none",async()=>{
  mocks.catalog.mockResolvedValueOnce([]);expect((await POST(req())).status).toBe(422);expect(q.insert).not.toHaveBeenCalled();
 });
 it("blocks already sent cases to avoid duplicate relances",async()=>{
  q.maybeSingle.mockReset().mockResolvedValueOnce({data:store}).mockResolvedValueOnce({data:sale}).mockResolvedValueOnce({data:{id:"case-1",status:"sent"}});
  expect((await POST(req())).status).toBe(409);expect(q.insert).not.toHaveBeenCalled();
 });
 it("reports catalog outages without saving a partial case",async()=>{
  mocks.catalog.mockRejectedValueOnce(new Error("offline"));expect((await POST(req())).status).toBe(503);expect(q.insert).not.toHaveBeenCalled();
 });
});
