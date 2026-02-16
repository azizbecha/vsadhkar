import { serve } from "@hono/node-server";

import app from "./app";

const port = 3000;

console.log(`Server running at http://localhost:${port}`);
console.log(`OpenAPI docs at http://localhost:${port}/api/doc`);

serve({ fetch: app.fetch, port });
