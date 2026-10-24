import assert from "node:assert/strict";
import { test } from "vitest";
import { loginEmailIpKey } from "@pulso/domain";
import { LOGIN_LIMIT, LOGIN_WINDOW_MS, admitLogin, clearLoginEmail, noteLoginFailure, resetLoginLimits } from "@/server/login-limit";

const start = 1_700_000_000_000;

test("loginEmailIpKey separa e-mail e IP, e a senha certa zera os dois baldes", () => {
  resetLoginLimits();
  assert.equal(loginEmailIpKey("  Dono@Pulso.Test ", "203.0.113.1"), "dono@pulso.test|203.0.113.1");
  const attacker = "203.0.113.50";
  const owner = "203.0.113.1";
  for (let n = 0; n < LOGIN_LIMIT; n += 1) {
    assert.equal(admitLogin(`giro-${n}@pulso.test`, attacker, start).ok, true);
    assert.equal(noteLoginFailure(`giro-${n}@pulso.test`, attacker, start), true);
  }
  assert.equal(admitLogin("dono@pulso.test", attacker, start).ok, false);
  assert.equal(admitLogin("dono@pulso.test", owner, start).ok, true);
  assert.equal(noteLoginFailure("  Dono@Pulso.Test ", owner, start), true);
  for (let n = 1; n < LOGIN_LIMIT; n += 1) assert.equal(noteLoginFailure("dono@pulso.test", owner, start), true);
  assert.equal(admitLogin("DONO@pulso.test", owner, start).ok, true);
  assert.equal(noteLoginFailure("dono@pulso.test", owner, start), false);
  assert.equal(admitLogin("outro@pulso.test", owner, start).ok, false);
  assert.equal(noteLoginFailure("dono@pulso.test", "203.0.113.9", start), true);
  assert.equal(admitLogin("outro@pulso.test", owner, start + LOGIN_WINDOW_MS).ok, true);
  clearLoginEmail("dono@pulso.test", owner, start);
  assert.equal(admitLogin("dono@pulso.test", owner, start).ok, true);
  assert.equal(noteLoginFailure("dono@pulso.test", owner, start), true);
  assert.equal(admitLogin("outro@pulso.test", owner, start).ok, true);
});
