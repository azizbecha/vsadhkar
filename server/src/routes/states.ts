import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { proxyGeo } from "../lib/proxy";
import { geoRouteConfig } from "../lib/create-geo-route";

const stateSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    iso2: z.string(),
    type: z.string().nullable(),
  })
  .openapi("State");

type State = z.infer<typeof stateSchema>;

const route = createRoute({
  ...geoRouteConfig({
    description: "A list of states in the given country",
    response: z.array(stateSchema),
  }),
  path: "/countries/{countryIso}/states",
  summary: "List states for a country",
  request: {
    params: z.object({
      countryIso: z.string().openapi({ description: "ISO2 country code", example: "US" }),
    }),
  },
});

const app = new OpenAPIHono();

app.openapi(route, async (c) => {
  const { countryIso } = c.req.valid("param");
  const data = await proxyGeo<State[]>(`/countries/${countryIso}/states`);
  return c.json(data);
});

export default app;
