import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("senha do admin", () => {
  it("confere o hash scrypt e rejeita outra senha", async () => {
    const hash = await hashPassword("senha-de-teste-123");
    expect(hash.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("senha-de-teste-123", hash)).toBe(true);
    expect(await verifyPassword("outra-senha-12345", hash)).toBe(false);
    expect(await verifyPassword("senha-de-teste-123", "texto-puro")).toBe(false);
  });

  it("recusa senha curta", async () => {
    await expect(hashPassword("curta")).rejects.toThrow(/12 caracteres/);
  });
});
