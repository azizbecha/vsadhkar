import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";

import countries from "./routes/countries";
import states from "./routes/states";
import cities from "./routes/cities";

const app = new OpenAPIHono().basePath("/api");

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
  apiReference({
    spec: { url: "/api/doc" },
    pageTitle: "VSAdhkar Geo API",
  })
);

export default app;
