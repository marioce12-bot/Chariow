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
function req(extra:Record<string,unknown>={}){return new Request("https://app.example/api/recovery/launch",{method:"POST",body:JSON.stringify({storeId,sourceSaleId:"sale-1",...extra})});}
function sequence(existing:any=null){q.maybeSingle.mockReset().mockResolvedValueOnce({data:store,error:null}).mockResolvedValueOnce({data:sale,error:null}).mockResolvedValueOnce({data:existing,error:null});}
function expectNoWrites(){expect(q.insert).not.toHaveBeenCalled();expect(q.update).not.toHaveBeenCalled();expect(q.delete).not.toHaveBeenCalled();}
beforeEach(()=>{
 vi.clearAllMocks();
 q={}; for(const key of ["select","eq","in","or","insert","update","delete"])q[key]=vi.fn(()=>q);
 q.maybeSingle=vi.fn(); sequence(); q.limit=vi.fn().mockResolvedValue({data:[],error:null});
 mocks.from.mockReturnValue(q);mocks.admin.mockReturnValue({from:mocks.from});mocks.auth.mockResolvedValue({user:{id:"owner"},supabase:{from:mocks.from}});
 mocks.catalog.mockResolvedValue([{id:"prd_demo",name:"Guide démo",url:"https://shop.example/prd_demo"}]);
});
describe("direct WhatsApp recovery launch (read-only draft)",()=>{
 it("requires authentication without consulting storage",async()=>{
  mocks.auth.mockResolvedValueOnce({user:null,response:new Response("Unauthorized",{status:401})});
  expect((await POST(req())).status).toBe(401);expect(mocks.from).not.toHaveBeenCalled();
 });
 it.each([{}, {consent:false}, {consent:true}])("ignores consent payload %j and returns a server-derived draft",async consent=>{
  const result=await POST(req({...consent,phone:"+19999999999",paymentUrl:"https://evil.example",status:"sent",customerName:"Forged"}));const data=await result.json();
  expect(result.status).toBe(200);expect(data).toMatchObject({id:"sale-1",status:"prepared",delivery:"manual"});
  expect(data.url).toContain("https://wa.me/2290100000000?");expect(data.message).toContain("https://shop.example/prd_demo");expect(data.message).toContain("STOP");
  expect(data.message).not.toContain("evil.example");expect(data.message).not.toContain("Forged");expectNoWrites();
  expect(q.eq).toHaveBeenCalledWith("user_id","owner");expect(q.eq).toHaveBeenCalledWith("chariow_sale_id","sale-1");
 });
 it("reopens an existing open/prepared case without consent and leaves its old fields untouched",async()=>{
  const old={id:"case-7",status:"open",payment_url:"https://shop.example/old",consent_at:null,consent_source:null,prepared_at:"2001-01-01",updated_at:"2001-01-01"};sequence(old);
  const result=await POST(req());const data=await result.json();expect(result.status).toBe(200);expect(data.id).toBe("case-7");expect(data.message).toContain(old.payment_url);expectNoWrites();
 });
 it.each(["sent","recovered","opted_out","closed"]) ("blocks existing %s cases without changing them",async status=>{
  sequence({id:"case-1",status,payment_url:"https://shop.example/old"});expect((await POST(req())).status).toBe(409);expectNoWrites();
 });
 it("checks store ownership",async()=>{q.maybeSingle.mockReset().mockResolvedValueOnce({data:null,error:null});expect((await POST(req())).status).toBe(404);expect(q.eq).toHaveBeenCalledWith("user_id","owner");expectNoWrites();});
 it.each([{status:"completed"},{occurred_at:"2020-01-01T00:00:00Z"},{occurred_at:new Date(Date.now()+864e5).toISOString()}])("rejects ineligible or stale sales %#",async change=>{
  q.maybeSingle.mockReset().mockResolvedValueOnce({data:store,error:null}).mockResolvedValueOnce({data:{...sale,...change},error:null});expect((await POST(req())).status).toBe(409);expectNoWrites();
 });
 it("honors prior opt-outs",async()=>{q.limit.mockResolvedValueOnce({data:[{id:"opted"}],error:null});expect((await POST(req())).status).toBe(403);expectNoWrites();});
 it("fails closed on opt-out lookup errors",async()=>{q.limit.mockResolvedValueOnce({data:null,error:new Error("db")});expect((await POST(req())).status).toBe(500);expectNoWrites();});
 it("fails closed on existing-case lookup errors",async()=>{q.maybeSingle.mockReset().mockResolvedValueOnce({data:store,error:null}).mockResolvedValueOnce({data:sale,error:null}).mockResolvedValueOnce({data:null,error:new Error("db")});expect((await POST(req())).status).toBe(500);expectNoWrites();});
 it("rejects malformed server phone numbers",async()=>{q.maybeSingle.mockReset().mockResolvedValueOnce({data:store,error:null}).mockResolvedValueOnce({data:{...sale,raw_payload:{customer:{phone:"12"}}},error:null});expect((await POST(req())).status).toBe(422);expectNoWrites();});
 it("does not invent a missing product link",async()=>{mocks.catalog.mockResolvedValueOnce([]);expect((await POST(req())).status).toBe(422);expectNoWrites();});
 it("reports catalog outages without saving a partial case",async()=>{mocks.catalog.mockRejectedValueOnce(new Error("offline"));expect((await POST(req())).status).toBe(503);expectNoWrites();});
 it("rejects invalid stored links for existing cases",async()=>{sequence({id:"case-2",status:"prepared",payment_url:"javascript:alert(1)"});expect((await POST(req())).status).toBe(422);expectNoWrites();});
});
