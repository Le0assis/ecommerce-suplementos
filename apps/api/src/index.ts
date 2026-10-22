import { serve } from "@hono/node-server";
import { loadEnv } from "@pulso/db/env";
import { app } from "./app";

loadEnv();

const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log(`API PULSO em http://127.0.0.1:${port}`);
});
