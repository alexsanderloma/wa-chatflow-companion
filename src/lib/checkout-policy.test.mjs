import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutRedirect, planChangeSearch, checkoutPaymentDecision, CHECKOUT_SUPPORT_MESSAGE, companyStatusForPlan, checkoutInitialPlan, checkoutCanSelect, checkoutAccessPlan, STARTER_TRIAL_DAYS } from "./checkout-policy.ts";
const now = Date.parse("2026-10-23T21:27:00Z");
const company = { status_cobranca: "ativo", trial_ate: "2026-10-26T00:00:00Z", onboarding_completed: true };
const sub = { id: "local", plan_id: "pro-id", provider: "asaas", status: "active", external_subscription_id: "sub_existing" };
const decision = (overrides = {}) => checkoutPaymentDecision({ companyStatus: "trial_expired", planId: "pro-id", subscriptions: [], ...overrides });
test("normal checkout redirects active/trial while explicit upgrade stays", () => {
  assert.equal(checkoutRedirect(company, undefined, now), "/app/dashboard");
  assert.equal(checkoutRedirect({ ...company, onboarding_completed: false }, undefined, now), "/app/onboarding");
  assert.equal(checkoutRedirect({ ...company, status_cobranca: "trial" }, undefined, now), "/app/dashboard");
  for (const status of ["ativo", "trial"]) assert.equal(checkoutRedirect({ ...company, status_cobranca: status }, "upgrade", now), null);
  assert.equal(checkoutRedirect(company, "anything", now), "/app/dashboard");
  assert.equal(checkoutRedirect({ ...company, status_cobranca: "trial", trial_ate: "2026-10-22T00:00:00Z" }, undefined, now), null);
});
test("change link uses real slug not display name and explicit mode", () => {
  assert.deepEqual(planChangeSearch({ slug: "pro", nome: "Profissional FLOWA" }, "business"), { plano: "pro", mode: "upgrade" });
  assert.deepEqual(planChangeSearch(null, "business"), { plano: "business", mode: "upgrade" });
  assert.deepEqual(planChangeSearch({ slug: "starter" }, null, false), { plano: "starter", mode: undefined });
});
test("existing provider subscription is reused only for matching plan on normal paywall", () => {
  assert.deepEqual(decision({ subscriptions: [sub] }), { kind: "reuse", subscriptionId: "sub_existing", rowId: "local" });
  assert.equal(decision({ subscriptions: [sub], planId: "business-id" }).kind, "support");
});
test("active and unexpired trial never create or reuse for an upgrade, even without mode", () => {
  for (const companyStatus of ["ativo", "trial"]) {
    assert.deepEqual(decision({ companyStatus, subscriptions: [sub] }), { kind: "support", message: CHECKOUT_SUPPORT_MESSAGE });
    assert.equal(decision({ companyStatus }).kind, "support");
  }
  assert.deepEqual(decision({ mode: "upgrade" }), { kind: "support", message: CHECKOUT_SUPPORT_MESSAGE });
});
test("unknown, canceled external history and durable reservation prevent duplicate creation", () => {
  assert.equal(decision({ subscriptions: [{ ...sub, external_subscription_id: null }] }).kind, "support");
  assert.equal(decision({ subscriptions: [{ ...sub, status: "canceled" }] }).kind, "support");
  assert.equal(decision({ subscriptions: [{ ...sub, provider: "manual", external_subscription_id: null, metadata: { checkout_reservation: "lock" } }] }).kind, "support");
  assert.equal(decision({ subscriptions: [sub, { ...sub, id: "second" }] }).kind, "support");
  assert.equal(decision().kind, "create");
  assert.deepEqual(decision({ subscriptions: [{ ...sub, provider: "manual", external_subscription_id: null }] }), { kind: "create", rowId: "local" });
});test("only plans with trial days start in trial; zero-trial plans wait for payment", () => {
  assert.equal(companyStatusForPlan(3), "trial");
  assert.equal(companyStatusForPlan(7), "trial");
  assert.equal(companyStatusForPlan(0), "checkout_pending");
  assert.equal(companyStatusForPlan(null), "checkout_pending");
  assert.equal(companyStatusForPlan(undefined), "checkout_pending");
});
test("new customers only receive three Starter trial days regardless of requested plan", () => {
  assert.equal(STARTER_TRIAL_DAYS, 3);
  for (const slug of ["starter", "pro", "business"]) assert.equal(checkoutInitialPlan(null, "upgrade", slug), "starter");
  assert.equal(checkoutCanSelect(null, "purchase"), false);
});
test("Pro and Business cannot get trial even if their configured days are nonzero", () => {
  assert.equal(companyStatusForPlan(3, "pro"), "checkout_pending");
  assert.equal(companyStatusForPlan(3, "business"), "checkout_pending");
});
test("customer trial cannot select another free plan, including legacy Business trials", () => {
  const trial = { status_cobranca: "trial", selected_plan_slug: "business" };
  assert.equal(checkoutInitialPlan(trial, "upgrade", "pro"), "starter");
  assert.equal(checkoutCanSelect(trial, "upgrade"), false);
  assert.equal(checkoutAccessPlan("trial", "business"), "starter");
  assert.equal(checkoutAccessPlan("ativo", "business"), "business");
});
test("trial purchase only opens a paid checkout; active subscriptions still need safe reconciliation", () => {
  assert.equal(decision({ companyStatus: "trial", mode: "purchase" }).kind, "create");
  assert.equal(decision({ companyStatus: "ativo", mode: "purchase" }).kind, "support");
  assert.equal(decision({ companyStatus: "trial", mode: "purchase", subscriptions: [sub], planId: "business-id" }).kind, "support");
  assert.equal(checkoutCanSelect({ status_cobranca: "trial" }, "purchase"), true);
});
