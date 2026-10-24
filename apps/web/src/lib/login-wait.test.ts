import assert from "node:assert/strict";
import { test } from "vitest";
import { loginLimitMessage, loginWaitLabel } from "@/lib/login-wait";

test("o 429 mostra o tempo do Retry-After", () => {
  assert.equal(loginWaitLabel("900"), "15 minutos");
  assert.equal(loginWaitLabel("60"), "1 minuto");
  assert.equal(loginWaitLabel("12"), "12 segundos");
  assert.equal(loginWaitLabel("1"), "1 segundo");
  assert.equal(loginWaitLabel("0"), null);
  assert.equal(
    loginLimitMessage("Muitas tentativas de login. Espera alguns minutos.", "900"),
    "Muitas tentativas de login. Espera 15 minutos.",
  );
  assert.equal(
    loginLimitMessage("Muitas tentativas de login. Espera alguns minutos.", "12"),
    "Muitas tentativas de login. Espera 12 segundos.",
  );
  assert.equal(
    loginLimitMessage("Muitas tentativas de login. Espera 15 minutos.", "900"),
    "Muitas tentativas de login. Espera 15 minutos.",
  );
});
