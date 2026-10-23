import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAuthMode, passwordIssues, validateSignup } from "./auth-mode.ts";

test("login is the default mode; signup only when explicitly requested", () => {
  assert.equal(resolveAuthMode(undefined), "login");
  assert.equal(resolveAuthMode(""), "login");
  assert.equal(resolveAuthMode("login"), "login");
  assert.equal(resolveAuthMode("qualquer"), "login");
  assert.equal(resolveAuthMode("signup"), "signup");
});

test("password requires 8+ chars with a letter and a number", () => {
  assert.ok(passwordIssues("abc1").length > 0);
  assert.ok(passwordIssues("abcdefgh").length > 0);
  assert.ok(passwordIssues("12345678").length > 0);
  assert.deepEqual(passwordIssues("senha123"), []);
});

test("signup validates email, password and confirmation", () => {
  assert.equal(validateSignup("ruim", "senha123", "senha123"), "E-mail inválido");
  assert.equal(validateSignup("a@b.com", "senha123", "senha124"), "As senhas não conferem");
  assert.equal(validateSignup("a@b.com", "curta1", "curta1"), "Mínimo de 8 caracteres");
  assert.equal(validateSignup("a@b.com", "senha123", "senha123"), null);
});
