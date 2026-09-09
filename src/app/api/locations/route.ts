import { NextResponse } from "next/server";
import { Country, State } from "country-state-city";
import { enforceRateLimit } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "public-locations", { limit: 120, windowSeconds: 60 });
  if (limited) return limited;

  const countryCode = new URL(request.url).searchParams.get("country")?.trim().toUpperCase();
  const items = countryCode
    ? State.getStatesOfCountry(countryCode).map((state) => ({ code: state.isoCode, name: state.name }))
    : Country.getAllCountries().map((country) => ({ code: country.isoCode, name: country.name }));

  const response = NextResponse.json({ items });
  response.headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return response;
}
