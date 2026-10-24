import http from "node:http";

export const SOCKET_IP_HEADER = "x-pulso-socket-ip";

function normalizeIp(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.startsWith("::ffff:")) return trimmed.slice("::ffff:".length);
  return trimmed;
}

/** Tira o IP que o cliente escreveu e grava o do socket. Com VERCEL=1 a plataforma já sobrescreveu os cabeçalhos dela. */
export function stampPeerHeaders(headers, remoteAddress, env = process.env) {
  if (env.VERCEL !== "1") {
    delete headers["x-vercel-forwarded-for"];
    delete headers["x-real-ip"];
  }
  const peer = remoteAddress ? normalizeIp(remoteAddress) : "";
  if (peer) headers[SOCKET_IP_HEADER] = peer;
  else delete headers[SOCKET_IP_HEADER];
}

let originalEmit;

export function installPeerStamp() {
  if (originalEmit) return;
  originalEmit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (event, req, ...rest) {
    if (event === "request" && req && typeof req === "object" && req.headers) {
      const remote = req.socket && typeof req.socket.remoteAddress === "string" ? req.socket.remoteAddress : "";
      stampPeerHeaders(req.headers, remote, process.env);
    }
    return originalEmit.call(this, event, req, ...rest);
  };
}

export function uninstallPeerStamp() {
  if (!originalEmit) return;
  http.Server.prototype.emit = originalEmit;
  originalEmit = undefined;
}

if (process.env.PULSO_STAMP_PEER === "1") installPeerStamp();
