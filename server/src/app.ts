import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";

import countries from "./routes/countries";
import states from "./routes/states";
import cities from "./routes/cities";

const app = new OpenAPIHono().basePath("/api");

app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");
});

app.route("/", countries);
app.route("/", states);
app.route("/", cities);

app.doc("/doc", {
  openapi: "3.1.0",
  info: {
    title: "VSAdhkar Geo API",
    version: "1.0.0",
    description:
      "Proxy API for country/state/city lookups used by the VSAdhkar extension",
  },
});

app.get(
  "/reference",
  Scalar({
    url: "/api/doc",
    title: "VSAdhkar Geo API",
  })
);

export default app;
