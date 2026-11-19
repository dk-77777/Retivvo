import type { FastifyRequest } from "fastify";
export class HttpError extends Error {
  statusCode: number;
  constructor(code: number, message: string) {
    super(message);
    this.statusCode = code;
  }
}

export function authHeaders(req: FastifyRequest) {
  const headers = new Headers({ "x-retivvo-peer": req.ip });
  for (const key of [
    "cookie",
    "origin",
    "content-type",
    "user-agent",
    "sec-fetch-site",
  ]) {
    const value = req.headers[key];
    if (typeof value === "string") headers.set(key, value);
  }
  return headers;
}
