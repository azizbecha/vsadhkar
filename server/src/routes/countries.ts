import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { proxyGeo } from "../lib/proxy";
import { geoRouteConfig } from "../lib/create-geo-route";

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
  ...geoRouteConfig({
    description: "A list of all countries",
    response: z.array(countrySchema),
  }),
  path: "/countries",
  summary: "List all countries",
});

const app = new OpenAPIHono();

app.openapi(route, async (c) => {
  const res = await proxyGeo("/countries");
  const data = await res.json();
  return c.json(data);
});

export default app;
