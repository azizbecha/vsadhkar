import { env } from "../env";

const BASE_URL = "https://api.countrystatecity.in/v1";

export async function proxyGeo(path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    headers: { "X-CSCAPI-KEY": env.API_KEY },
  });
}
