import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

export function totp(uri: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const base32 = new URL(uri).searchParams.get("secret")!;
  const bits = Array.from(base32, (c) =>
    alphabet.indexOf(c).toString(2).padStart(5, "0"),
  ).join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  return ((hmac.readUInt32BE(hmac[19] & 15) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}

export async function mailedUrl(email: string, subject: string) {
  const api = "http://127.0.0.1:8025/api/v1";
  const until = Date.now() + 20000;
  do {
    const search = await fetch(
      api + "/search?query=" + encodeURIComponent("to:" + email),
    );
    assert.equal(search.status, 200);
    const message = (await search.json()).messages.find(
      (m: { Subject: string }) => m.Subject === subject,
    );
    if (!message) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    const content = await fetch(api + "/message/" + message.ID);
    const link = new URL(
      (await content.json()).Text.trim().split(/\s+/).at(-1),
    );
    return link;
  } while (Date.now() < until);
  throw new Error("O SMTP local não entregou a mensagem aguardada no prazo.");
}
