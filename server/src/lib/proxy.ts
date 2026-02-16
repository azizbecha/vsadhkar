import { env } from "../env";

const BASE_URL = "https://api.countrystatecity.in/v1";
const TTL = 24 * 60 * 60 * 1000; // 24 hours

const cache = new Map<string, { data: unknown; expiresAt: number }>();

export async function proxyGeo<T = unknown>(path: string): Promise<T> {
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-CSCAPI-KEY": env.API_KEY },
  });
  const data = (await res.json()) as T;

  cache.set(path, { data, expiresAt: Date.now() + TTL });
  return data;
}
