import assert from "node:assert/strict";
import { test } from "vitest";
import { uniqueRecordId, variantSku } from "@/lib/record-id";

test("variação e foto novas não repetem var-1 nem foto-1", () => {
  const first = uniqueRecordId();
  const second = uniqueRecordId();
  assert.notEqual(first, second);
  assert.notEqual(first, "var-1");
  assert.notEqual(second, "foto-1");
  assert.equal(first.length <= 120, true);
  assert.match(first, /^[0-9a-f-]{36}$/i);

  const skuA = variantSku("qa-whey", first);
  const skuB = variantSku("qa-whey", second);
  assert.notEqual(skuA, skuB);
  assert.equal(skuA.startsWith("PL-QAWHEY-"), true);
  assert.equal(skuA.length <= 48, true);
  assert.equal(variantSku("", first).startsWith("PL-NOVO-"), true);
});
