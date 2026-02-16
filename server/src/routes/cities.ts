import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { proxyGeo } from "../lib/proxy";

const citySchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .openapi("City");

const route = createRoute({
  method: "get",
  path: "/countries/{countryIso}/states/{stateIso}/cities",
  summary: "List cities for a state",
  request: {
    params: z.object({
      countryIso: z.string().openapi({ description: "ISO2 country code", example: "US" }),
      stateIso: z.string().openapi({ description: "ISO2 state code", example: "CA" }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(citySchema) } },
      description: "A list of cities in the given state",
    },
  },
});

const app = new OpenAPIHono();

app.openapi(route, async (c) => {
  const { countryIso, stateIso } = c.req.valid("param");
  const res = await proxyGeo(`/countries/${countryIso}/states/${stateIso}/cities`);
  const data = await res.json();
  return c.json(data);
});

export default app;
