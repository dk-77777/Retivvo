const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
export function money(cents: string) {
  const padded = cents.padStart(3, "0");
  return brl
    .format(BigInt(padded.slice(0, -2)))
    .replace(/,00$/, "," + padded.slice(-2));
}

export function parseAmount(value: string) {
  const [whole, fraction = ""] = value.split(/[,.]/);
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
