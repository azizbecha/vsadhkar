import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { proxyGeo } from "../lib/proxy";
import { geoRouteConfig } from "../lib/create-geo-route";

const citySchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .openapi("City");

type City = z.infer<typeof citySchema>;

const route = createRoute({
  ...geoRouteConfig({
    description: "A list of cities in the given state",
    response: z.array(citySchema),
  }),
  path: "/countries/{countryIso}/states/{stateIso}/cities",
  summary: "List cities for a state",
  request: {
    params: z.object({
      countryIso: z.string().openapi({ description: "ISO2 country code", example: "US" }),
      stateIso: z.string().openapi({ description: "ISO2 state code", example: "CA" }),
    }),
  },
});

const app = new OpenAPIHono();

app.openapi(route, async (c) => {
  const { countryIso, stateIso } = c.req.valid("param");
  const data = await proxyGeo<City[]>(`/countries/${countryIso}/states/${stateIso}/cities`);
  return c.json(data);
});

export default app;
