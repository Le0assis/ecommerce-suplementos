import { expect, test } from "@playwright/test";

test("quiz, sabor, sacola, login e raspadinha respondem ao clique", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/quiz");
  await page.getByRole("button", { name: "Pode salvar" }).click();
  await page.getByRole("button", { name: "Hipertrofia" }).click();
  await expect(page.getByText("2 / 5")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("--d --h --m")).toHaveCount(0);
  await expect(page.getByText(/\d+d \d+h \d+m \d+s/)).toBeVisible();

  await page.goto("/loja/caos-pre-treino");
  const uva = page.getByRole("button", { name: /Uva Insana/ });
  await uva.click();
  await expect(uva).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Adiciona na sacola" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Uva Insana · 300 g · 30 doses")).toBeVisible();
  await drawer.getByRole("link", { name: "Ver sacola" }).click();
  await expect(page).toHaveURL(/\/carrinho/);
  const sacola = page.locator("#conteudo");
  await expect(sacola.getByText("Uva Insana · 300 g · 30 doses")).toBeVisible();
  await page.reload();
  await expect(page.locator("#conteudo").getByText("Uva Insana · 300 g · 30 doses")).toBeVisible();

  await page.goto("/raspadinha");
  await expect(page.getByRole("button", { name: "Revelar sem raspar" })).toBeVisible();

  await page.goto("/entrar");
  const login = page.locator("#conteudo").getByRole("form", { name: "Entrar na conta" });
  await login.getByLabel("E-mail").fill("ana@pulso.dev");
  await login.getByLabel("Senha").fill("pulso123");
  await login.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/conta$/);
  await expect(page.getByRole("heading", { name: /Ana/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Ana/ })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
