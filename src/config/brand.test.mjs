import { test } from "node:test";
import assert from "node:assert/strict";
import { supportWhatsapp, supportWhatsappUrl } from "./brand.ts";

test("FLOWA support uses the approved WhatsApp destination", () => {
  assert.equal(supportWhatsapp, "5531973175308");
  assert.equal(supportWhatsappUrl, "https://wa.me/5531973175308");
});