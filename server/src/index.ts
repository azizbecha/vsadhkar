import { handle } from "hono/vercel";

import app from "./app";

export default handle(app);
