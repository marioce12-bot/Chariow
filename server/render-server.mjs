import http from "node:http";
import next from "next";
import { handleStudioProxy } from "./studio-proxy.mjs";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");

const app = next({ dev: false, hostname: "0.0.0.0", port });
await app.prepare();
const handleNext = app.getRequestHandler();

const server = http.createServer((req, res) => {
  if (handleStudioProxy(req, res)) return;
  void handleNext(req, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Vendeo Render server listening on 0.0.0.0:${port}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
