import { test } from "node:test";
import assert from "node:assert/strict";
import { withTimeout, AuthTimeoutError, resolvePostAuthDestination, isAuthConnectionError } from "./auth-timeout.ts";

test('connection failures are distinguished from invalid credentials', () => {
  assert.equal(isAuthConnectionError(new TypeError('Failed to fetch')), true);
  assert.equal(isAuthConnectionError({ name: 'AuthRetryableFetchError' }), true);
  assert.equal(isAuthConnectionError({ status: 504 }), true);
  assert.equal(isAuthConnectionError({ message: 'Invalid login credentials', status: 400 }), false);
});

const never = () => new Promise(() => {});

test("withTimeout rejects slow operations and passes fast ones", async () => {
  await assert.rejects(withTimeout(never(), 20), AuthTimeoutError);
  assert.equal(await withTimeout(Promise.resolve(7), 20), 7);
});

test("plan goes to checkout with plan", async () => {
  assert.equal(await resolvePostAuthDestination("pro", { isSuperAdmin: never, hasCompany: never }), "/app/checkout?plano=pro");
});

test("normal routing for admin, member and user without company", async () => {
  assert.equal(await resolvePostAuthDestination(undefined, { isSuperAdmin: async () => true, hasCompany: async () => true }), "/master/painel");
  assert.equal(await resolvePostAuthDestination(undefined, { isSuperAdmin: async () => false, hasCompany: async () => true }), "/app/dashboard");
  assert.equal(await resolvePostAuthDestination(undefined, { isSuperAdmin: async () => false, hasCompany: async () => false }), "/app/checkout");
});

test("failed or slow lookups fall back to dashboard", async () => {
  assert.equal(await resolvePostAuthDestination(undefined, { isSuperAdmin: async () => { throw new Error("x"); }, hasCompany: async () => true }), "/app/dashboard");
  assert.equal(await resolvePostAuthDestination(undefined, { isSuperAdmin: async () => false, hasCompany: never }, 20), "/app/dashboard");
});
