import { describe, expect, it } from "vitest";
import { maskWaitlistEmail } from "./drops";

describe("máscara do e-mail da lista", () => {
  it("guarda a inicial e o domínio de topo", () => {
    expect(maskWaitlistEmail("julia@dominio.com")).toBe("j***@d***.com");
    expect(maskWaitlistEmail("  Bia@Pulso.Test ")).toBe("b***@p***.test");
    expect(maskWaitlistEmail("joao.silva@empresa.com.br")).toBe("j***@e***.com.br");
    expect(maskWaitlistEmail("j@d.com")).toBe("j***@d***.com");
  });

  it("não devolve o endereço quando a forma é inútil", () => {
    expect(maskWaitlistEmail("sem-arroba")).toBe("***");
    expect(maskWaitlistEmail("@dominio.com")).toBe("***");
    expect(maskWaitlistEmail("julia@localhost")).toBe("***");
    expect(maskWaitlistEmail("julia@dominio.com")).not.toContain("julia");
    expect(maskWaitlistEmail("julia@dominio.com")).not.toContain("dominio");
  });
});