import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { proxyGeo } from "../lib/proxy";

const stateSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    iso2: z.string(),
    type: z.string().nullable(),
  })
  .openapi("State");

const route = createRoute({
  method: "get",
  path: "/countries/{countryIso}/states",
  summary: "List states for a country",
  request: {
    params: z.object({
      countryIso: z.string().openapi({ description: "ISO2 country code", example: "US" }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(stateSchema) } },
      description: "A list of states in the given country",
    },
  },
});

const app = new OpenAPIHono();

app.openapi(route, async (c) => {
  const { countryIso } = c.req.valid("param");
  const res = await proxyGeo(`/countries/${countryIso}/states`);
  const data = await res.json();
  return c.json(data);
});

export default app;
