import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMasterPlanInput, masterPlanDecision, OPERATIONAL_SUBSCRIPTION_STATUSES } from "./master-plan.ts";

const companyId = "c1705c1d-80c5-4dc1-8736-936d7c5746c9";
const planId = "a0fc2b95-990a-47d2-9daa-d050b63906e7";
test("assign requires valid company and plan UUIDs; cancel never accepts a plan", () => {
  assert.throws(() => validateMasterPlanInput({ companyId: "invalid", planId, action: "assign" }));
  assert.throws(() => validateMasterPlanInput({ companyId, action: "assign" }));
  assert.throws(() => validateMasterPlanInput({ companyId, planId: "invalid", action: "assign" }));
  assert.deepEqual(validateMasterPlanInput({ companyId, planId, action: "assign" }), { companyId, planId, action: "assign" });
  assert.equal(validateMasterPlanInput({ companyId, planId, action: "cancel" }).planId, null);
});
test("manual assignment is active with a clamped calendar month", () => {
  const result = masterPlanDecision({ status_cobranca: "ativo", trial_ate: "2026-01-01T00:00:00.000Z" }, "assign", new Date("2026-01-31T12:00:00.000Z"));
  assert.deepEqual(result, { status: "active", companyStatus: "ativo", periodEnd: "2026-02-28T12:00:00.000Z", trialEndsAt: null, canceledAt: null });
});
test("only a real unexpired company trial is preserved, not renewed", () => {
  const now = new Date("2026-10-23T12:00:00.000Z");
  const trial = { status_cobranca: "trial", trial_ate: "2026-10-25T12:00:00.000Z" };
  const result = masterPlanDecision(trial, "assign", now);
  assert.equal(result.status, "active");
  assert.equal(result.companyStatus, "trial");
  assert.equal(result.trialEndsAt, trial.trial_ate);
  assert.equal(result.periodEnd, trial.trial_ate);
  assert.equal(masterPlanDecision({ ...trial, status_cobranca: "suspenso" }, "assign", now).trialEndsAt, null);
  assert.equal(masterPlanDecision({ ...trial, trial_ate: now.toISOString() }, "assign", now).companyStatus, "ativo");
});
test("removal ends entitlement immediately and canceled history is nonoperational", () => {
  const now = new Date("2026-10-23T12:00:00.000Z");
  assert.deepEqual(masterPlanDecision({ status_cobranca: "trial", trial_ate: "2026-11-01T00:00:00.000Z" }, "cancel", now), {
    status: "canceled", companyStatus: "suspenso", periodEnd: now.toISOString(), trialEndsAt: null, canceledAt: now.toISOString(),
  });
  assert.deepEqual([...OPERATIONAL_SUBSCRIPTION_STATUSES], ["trialing", "active", "past_due", "incomplete", "paused"]);
  assert.equal(OPERATIONAL_SUBSCRIPTION_STATUSES.includes("canceled"), false);
});