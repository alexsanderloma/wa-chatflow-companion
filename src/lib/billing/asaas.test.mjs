import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAsaas, mapAsaasEvent } from "./normalize.ts";
import { isValidWebhookToken, extractWebhookToken, isAlreadyProcessed } from "./auth.ts";

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
