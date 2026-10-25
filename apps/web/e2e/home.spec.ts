import { expect, test } from "@playwright/test";

test("a home abre o Caos e a loja lista produto", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sabor alto/i })).toBeVisible();
  await page.getByRole("link", { name: "Quero o Caos" }).click();
  await expect(page).toHaveURL(/\/loja\/caos-pre-treino/);
  await expect(page.getByRole("heading", { name: "Caos" })).toBeVisible();
  await page.goto("/loja");
  await expect(page.getByRole("link", { name: /Caos/i }).first()).toBeVisible();
});
