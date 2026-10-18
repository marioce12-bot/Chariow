import { beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/translate";
const mocks = vi.hoisted(() => ({ locale: "fr" as "fr" | "en", state: [] as unknown[], index: 0, set: vi.fn() }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [mocks.state[mocks.index++] ?? initial, mocks.set],
  useEffect: () => {}, useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({ current: value }),
}));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({locale: mocks.locale, t: (key: string) => translate(mocks.locale, key)}) }));
import RecoveryPanel from "@/components/dashboard/RecoveryPanel";
const candidate = {id:"demo-sale",phone:"+2290100000000",paymentUrl:"https://shop.example/demo",customerName:"Client démo",productName:"Guide",status:"abandoned",amount:1000,currency:"XOF",abandonedAt:"2026-10-17T00:00:00Z",email:null,failureReason:null,hasContact:true};
function findButton(node: any): any {
  if (!node || typeof node !== "object") return;
  if (node.type === "button" && node.props.className === "rec-primary" && node.props.children?.some?.((x:any) => x === translate(mocks.locale,"finalExtra.text14"))) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = findButton(child); if (found) return found; }
}
let target: any;
let open: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.index=0; mocks.locale="fr";
  mocks.state=[[],[candidate],[],false,false,false,"","",""];
  target={opener:{},document:{title:"",body:{textContent:""}},closed:false,location:{replace:vi.fn()},close:vi.fn()};
  open=vi.fn(() => target); fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"demo-sale",url:"https://wa.me/2290100000000?text=demo",message:"Brouillon démo"})});
  vi.stubGlobal("window",{open}); vi.stubGlobal("fetch",fetchMock);
});
describe("recovery direct button interactions (no real WhatsApp requests)", () => {
  it.each(["fr","en"] as const)("is immediately enabled and opens a draft in %s",async locale => {
    mocks.locale=locale;
    const button=findButton(RecoveryPanel({storeId:"demo-store"}));
    expect(button).toBeDefined(); expect(button.props.disabled).toBe(false);
    button.props.onClick();
    expect(open).toHaveBeenCalledWith("about:blank","_blank");
    await vi.waitFor(()=>expect(target.location.replace).toHaveBeenCalledWith("https://wa.me/2290100000000?text=demo"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({storeId:"demo-store",sourceSaleId:"demo-sale"});
    expect(target.opener).toBeNull();
  });
  it("offers a draft preview if the popup is blocked",async()=>{
    open.mockReturnValue(null);
    findButton(RecoveryPanel({storeId:"demo-store"})).props.onClick();
    await vi.waitFor(()=>expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({message:"Brouillon démo"})));
  });
  it("closes the blank popup when draft preparation fails",async()=>{
    fetchMock.mockResolvedValueOnce({ok:false,json:async()=>({error:"Contact désabonné"})});
    findButton(RecoveryPanel({storeId:"demo-store"})).props.onClick();
    await vi.waitFor(()=>expect(target.close).toHaveBeenCalledOnce());
    expect(target.location.replace).not.toHaveBeenCalled();
  });
  it("still disables the button if the phone or payment link is missing",()=>{
    for(const changes of [{phone:null},{paymentUrl:null}]){
      mocks.index=0; mocks.state[1]=[{...candidate,...changes}];
      expect(findButton(RecoveryPanel({storeId:"demo-store"})).props.disabled).toBe(true);
    }
  });
});
