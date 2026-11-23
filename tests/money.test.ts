import assert from "node:assert/strict";
import test from "node:test";
import { money, parseAmount } from "../web/money.ts";

test("converte o valor do orçamento em centavos inteiros", () => {
  for (const [input, cents] of [
    ["0", 0],
    ["0,01", 1],
    ["0.29", 29],
    ["1,2", 120],
    ["1234,56", 123456],
    ["999999999,99", 99999999999],
  ] as const)
    assert.equal(parseAmount(input), cents);
});

test("formata os totais em reais sem perder centavos", () => {
  const normalized = (cents: string) => money(cents).replace(/\p{Zs}/gu, " ");
  assert.equal(normalized("0"), "R$ 0,00");
  assert.equal(normalized("1"), "R$ 0,01");
  assert.equal(normalized("125050"), "R$ 1.250,50");
  assert.equal(normalized("900719925474099199"), "R$ 9.007.199.254.740.991,99");
});
