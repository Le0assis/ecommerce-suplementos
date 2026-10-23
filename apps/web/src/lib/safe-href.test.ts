import assert from "node:assert/strict";
import { test } from "vitest";
import { bannerHrefError, jsonLdHtml, safeBannerHref } from "@/lib/safe-href";

test("o link do banner só aceita https ou um caminho", () => {
  assert.equal(safeBannerHref("https://pulso.dev/drop"), "https://pulso.dev/drop");
  assert.equal(safeBannerHref("  HTTPS://pulso.dev  "), "HTTPS://pulso.dev");
  assert.equal(safeBannerHref("/loja/caos-pre-treino"), "/loja/caos-pre-treino");
  assert.equal(safeBannerHref("/"), "/");
  for (const href of ["//pulso.dev", "javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,hi", "http://pulso.dev", "https:alert(1)", "/\\pulso.dev"]) {
    assert.equal(safeBannerHref(href), null, href);
    assert.match(bannerHrefError(href) ?? "", /https/);
  }
  assert.equal(bannerHrefError(""), null);
  assert.equal(bannerHrefError("   "), null);
});

test("o json-ld não deixa o nome do produto fechar o script", () => {
  const html = jsonLdHtml({ name: `</script><script>alert(1)</script>` });
  assert.equal(html.includes("</script>"), false);
  assert.equal(html.includes("<script"), false);
  assert.match(html, /\\u003c\/script>/);
  assert.match(html, /\\u003cscript>/);
});
