import assert from "node:assert/strict";
import { test } from "vitest";
import { maskEmail } from "@/lib/mask-email";

test("e-mail de atendimento sai mascarado e o mascarado não volta", () => {
  assert.equal(maskEmail("joao@drop.com"), "j***@d***.com");
  assert.equal(maskEmail("bia@pulso.test"), "b***@p***.test");
  assert.equal(maskEmail("Ana@Mail.CO.UK"), "a***@m***.co.uk");
  assert.equal(maskEmail(maskEmail("Ana@Mail.CO.UK")), "a***@m***.co.uk");
  assert.equal(maskEmail("sem-arroba"), "***");
  assert.equal(maskEmail("local"), "***");
});
