import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { proxyGeo } from "../lib/proxy";

const countrySchema = z
  .object({
    id: z.number(),
    name: z.string(),
    iso2: z.string(),
    iso3: z.string(),
    phonecode: z.string(),
    capital: z.string(),
    currency: z.string(),
    native: z.string(),
    emoji: z.string(),
  })
  .openapi("Country");

const route = createRoute({
  method: "get",
  path: "/countries",
  summary: "List all countries",
  responses: {
    200: {
      content: { "application/json": { schema: z.array(countrySchema) } },
      description: "A list of all countries",
    },
  },
});

const app = new OpenAPIHono();

app.openapi(route, async (c) => {
  const res = await proxyGeo("/countries");
  const data = await res.json();
  return c.json(data);
});

export default app;
