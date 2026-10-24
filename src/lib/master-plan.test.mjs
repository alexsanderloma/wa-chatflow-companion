import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMasterPlanInput, masterPlanDecision, OPERATIONAL_SUBSCRIPTION_STATUSES } from "./master-plan.ts";

const companyId = "c1705c1d-80c5-4dc1-8736-936d7c5746c9";
const planId = "a0fc2b95-990a-47d2-9daa-d050b63906e7";
test("assign requires valid company and plan UUIDs; cancel never accepts a plan", () => {
  assert.throws(() => validateMasterPlanInput({ companyId: "invalid", planId, action: "assign" }));
  assert.throws(() => validateMasterPlanInput({ companyId, action: "assign" }));
  assert.throws(() => validateMasterPlanInput({ companyId, planId: "invalid", action: "assign" }));
  assert.throws(() => validateMasterPlanInput({ companyId, planId, action: "assign" }));
  assert.throws(() => validateMasterPlanInput({ companyId, planId, action: "assign", period: "trial_365" }));
  assert.deepEqual(validateMasterPlanInput({ companyId, planId, action: "assign", period: "trial_7" }), { companyId, planId, action: "assign", period: "trial_7" });
  assert.equal(validateMasterPlanInput({ companyId, planId, action: "cancel" }).planId, null);
});
test("temporary access is active for exactly 30 days, without trial", () => {
  const result = masterPlanDecision("temporary_30", "assign", new Date("2026-01-31T12:00:00.000Z"));
  assert.deepEqual(result, { status: "active", companyStatus: "ativo", periodEnd: "2026-03-02T12:00:00.000Z", trialEndsAt: null, canceledAt: null });
});
test("Master trial is exactly 7 days, with trialing status", () => {
  const now = new Date("2026-10-23T12:00:00.000Z");
  const result = masterPlanDecision("trial_7", "assign", now);
  assert.equal(result.status, "trialing");
  assert.equal(result.companyStatus, "trial");
  assert.equal(result.trialEndsAt, "2026-10-30T12:00:00.000Z");
  assert.equal(result.periodEnd, "2026-10-30T12:00:00.000Z");
});
test("permanent Master access is active with no expiry or trial", () => {
  assert.deepEqual(masterPlanDecision("permanent", "assign", new Date("2026-10-23T12:00:00.000Z")), {
    status: "active", companyStatus: "ativo", periodEnd: null, trialEndsAt: null, canceledAt: null,
  });
});
test("removal ends entitlement immediately and canceled history is nonoperational", () => {
  const now = new Date("2026-10-23T12:00:00.000Z");
  assert.deepEqual(masterPlanDecision(null, "cancel", now), {
    status: "canceled", companyStatus: "suspenso", periodEnd: now.toISOString(), trialEndsAt: null, canceledAt: now.toISOString(),
  });
  assert.deepEqual([...OPERATIONAL_SUBSCRIPTION_STATUSES], ["trialing", "active", "past_due", "incomplete", "paused"]);
  assert.equal(OPERATIONAL_SUBSCRIPTION_STATUSES.includes("canceled"), false);
});