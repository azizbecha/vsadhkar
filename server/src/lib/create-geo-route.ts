import type { z } from "@hono/zod-openapi";

export function geoRouteConfig<T extends z.ZodType>(opts: {
  description: string;
  response: T;
}) {
  return {
    method: "get" as const,
    responses: {
      200: {
        content: { "application/json": { schema: opts.response } },
        description: opts.description,
      },
    },
  };
}
