"use strict";

// Minimal local forward proxy for testing lib/proxy.js on a machine that
// doesn't sit behind a real corporate proxy. Only implements CONNECT
// tunneling (HTTPS) — that's all lib/proxy.js ever needs, since every
// request it makes is to an HTTPS host. It never terminates TLS: once the
// tunnel is open, it just pipes raw bytes both ways.

const http = require("http");
const net = require("net");

const PORT = 8888;
const HOST = "127.0.0.1";

const server = http.createServer((req, res) => {
  res.writeHead(405, { "Content-Type": "text/plain" });
  res.end("This proxy only supports CONNECT tunneling (HTTPS).\n");
});

server.on("connect", (req, clientSocket, head) => {
  const [host, portStr] = req.url.split(":");
  const port = Number(portStr) || 443;

  const targetSocket = net.connect(port, host, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    targetSocket.write(head);
    targetSocket.pipe(clientSocket);
    clientSocket.pipe(targetSocket);
  });

  targetSocket.on("error", (err) => {
    console.error(`[local-proxy] target connection error (${host}:${port}):`, err.message);
    clientSocket.end();
  });
  clientSocket.on("error", () => targetSocket.end());
});

server.listen(PORT, HOST, () => {
  console.log(`Local passthrough proxy listening on http://${HOST}:${PORT}`);
  console.log("Point PROXY_DOMAIN/PROXY_PORT at this, leave PROXY_CERT empty.");
});
