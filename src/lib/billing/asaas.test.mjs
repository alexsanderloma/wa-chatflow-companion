import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAsaas, mapAsaasEvent, parseFlowaReference, buildFlowaReference } from "./normalize.ts";
import { isValidWebhookToken, extractWebhookToken, isAlreadyProcessed } from "./auth.ts";

const COMPANY_ID = "65238820-b0e6-4939-aee7-641050586725";
const PLAN_ID = "11111111-2222-3333-4444-555555555555";

test("one-off received payment is purchase_approved", () => {
  const e = normalizeAsaas({ id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1", customer: "cus_1", value: 97.5 } });
  assert.equal(e.eventType, "purchase_approved");
  assert.equal(e.eventId, "evt_1");
  assert.equal(e.externalPaymentId, "pay_1");
  assert.equal(e.externalCustomerId, "cus_1");
  assert.equal(e.amountCents, 9750);
  assert.equal(e.buyerEmail, null);
  assert.equal(e.productRef, null);
});

test("confirmed subscription payment is subscription_renewed", () => {
  const e = normalizeAsaas({ id: "evt_2", event: "PAYMENT_CONFIRMED", payment: { id: "pay_2", subscription: "sub_9", customer: "cus_1", externalReference: "pro" } });
  assert.equal(e.eventType, "subscription_renewed");
  assert.equal(e.externalSubscriptionId, "sub_9");
  assert.equal(e.productRef, "pro");
});

test("failure, refund, chargeback and cancel mappings", () => {
  assert.equal(mapAsaasEvent("PAYMENT_OVERDUE", false), "payment_failed");
  assert.equal(mapAsaasEvent("PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", true), "payment_failed");
  assert.equal(mapAsaasEvent("PAYMENT_REFUNDED", false), "refunded");
  assert.equal(mapAsaasEvent("PAYMENT_CHARGEBACK_REQUESTED", false), "chargeback");
  assert.equal(mapAsaasEvent("SUBSCRIPTION_INACTIVATED", true), "subscription_canceled");
  assert.equal(mapAsaasEvent("SUBSCRIPTION_DELETED", true), "subscription_canceled");
  assert.equal(mapAsaasEvent("PAYMENT_CREATED", false), "unknown");
  assert.equal(mapAsaasEvent("WHATEVER", false), "unknown");
});

test("subscription event reads subscription id and explicit email", () => {
  const e = normalizeAsaas({ id: "evt_3", event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_5", customer: { id: "cus_2", email: "A@B.com" } } });
  assert.equal(e.externalSubscriptionId, "sub_5");
  assert.equal(e.externalCustomerId, "cus_2");
  assert.equal(e.buyerEmail, "a@b.com");
});

test("token validation", () => {
  assert.equal(isValidWebhookToken("abc", "abc"), true);
  assert.equal(isValidWebhookToken("abd", "abc"), false);
  assert.equal(isValidWebhookToken("abc", ""), false);
  assert.equal(isValidWebhookToken("", undefined), false);
});

test("asaas token only from asaas-access-token header", () => {
  const url = new URL("https://x/api?provider=asaas&token=q");
  assert.equal(extractWebhookToken("asaas", url, new Headers()), "");
  assert.equal(extractWebhookToken("asaas", url, new Headers({ "asaas-access-token": "h" })), "h");
  assert.equal(extractWebhookToken("kiwify", url, new Headers()), "q");
});

test("idempotency helper", () => {
  assert.equal(isAlreadyProcessed([{ processed: true }]), true);
  assert.equal(isAlreadyProcessed([{ processed: false }]), false);
  assert.equal(isAlreadyProcessed([]), false);
  assert.equal(isAlreadyProcessed(null), false);
});

test("flowa reference roundtrip and validation", () => {
  const ref = buildFlowaReference(COMPANY_ID, PLAN_ID);
  assert.equal(ref, `flowa:${COMPANY_ID}:${PLAN_ID}`);
  assert.deepEqual(parseFlowaReference(ref), { companyId: COMPANY_ID, planId: PLAN_ID });
  assert.deepEqual(parseFlowaReference(`flowa:${COMPANY_ID.toUpperCase()}:${PLAN_ID.toUpperCase()}`), {
    companyId: COMPANY_ID,
    planId: PLAN_ID,
  });
  assert.equal(parseFlowaReference("flowa:nao-e-uuid:123"), null);
  assert.equal(parseFlowaReference(`flowa:${COMPANY_ID}`), null);
  assert.equal(parseFlowaReference(`kiwify:${COMPANY_ID}:${PLAN_ID}`), null);
  assert.equal(parseFlowaReference(""), null);
  assert.equal(parseFlowaReference(null), null);
  assert.equal(parseFlowaReference(undefined), null);
});

test("event with flowa reference and no email still resolves company and plan", () => {
  const ref = buildFlowaReference(COMPANY_ID, PLAN_ID);
  const e = normalizeAsaas({
    id: "evt_ref",
    event: "PAYMENT_CONFIRMED",
    payment: { id: "pay_r", subscription: "sub_r", customer: "cus_r", externalReference: ref },
  });
  assert.equal(e.buyerEmail, null);
  assert.deepEqual(e.flowaRef, { companyId: COMPANY_ID, planId: PLAN_ID });
  assert.equal(e.externalSubscriptionId, "sub_r");
});

test("event with invalid reference has no flowaRef", () => {
  const e = normalizeAsaas({
    id: "evt_bad",
    event: "PAYMENT_RECEIVED",
    payment: { id: "pay_b", externalReference: "pedido-123" },
  });
  assert.equal(e.flowaRef, null);
  assert.equal(e.productRef, "pedido-123");
});
