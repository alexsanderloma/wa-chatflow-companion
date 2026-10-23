import { test } from "node:test";
import assert from "node:assert/strict";
import { brand, supportWhatsapp, supportWhatsappUrl, supportWhatsappDisplay } from "./brand.ts";

test("FLOWA support uses the approved WhatsApp destination", () => {
  assert.equal(supportWhatsapp, "5531973175308");
  assert.equal(supportWhatsappUrl, "https://wa.me/5531973175308");
});
test("Product identity is FLOWA", () => {
  assert.equal(brand.name, "FLOWA");
});

test("Support displays the approved Brazilian number", () => {
  assert.equal(supportWhatsappDisplay, "+55 31 97317-5308");
});
