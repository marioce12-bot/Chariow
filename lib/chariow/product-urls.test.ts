import {describe,it,expect} from "vitest";
import {resolveChariowProductUrl} from "./product-urls";
describe("Chariow product pages",()=>{
 it("resolves the actual public-ID storefront route when slug is null",()=>{
  expect(resolveChariowProductUrl({id:"prd_demo123",slug:null,status:"published",store:{url:"https://demo.mychariow.shop"}})).toBe("https://demo.mychariow.shop/prd_demo123");
 });
 it("prefers official direct product links",()=>{
  expect(resolveChariowProductUrl({id:"prd_demo123",status:"published",url:"https://shop.example/custom-guide",store:{url:"https://demo.mychariow.shop"}})).toBe("https://shop.example/custom-guide");
 });
 it("never uses an arbitrary reference, draft ID or unsafe store URL",()=>{
  expect(resolveChariowProductUrl({id:"reference-1",status:"published",store:{url:"https://shop.example"}})).toBeNull();
  expect(resolveChariowProductUrl({id:"prd_demo123",status:"draft",store:{url:"https://shop.example"}})).toBeNull();
  expect(resolveChariowProductUrl({id:"prd_demo123",status:"published",store:{url:"https://user:secret@shop.example"}})).toBeNull();
 });
});
