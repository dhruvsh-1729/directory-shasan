// utils/location.ts
import { countries } from "@/data/locations/countries";
import { convertCase } from "./helpers";

export type Option = { value: string; label: string };

export const getCoverImage = (imageUrl: string): string =>
  imageUrl
    ? imageUrl.includes("https://")
      ? imageUrl
      : `https://www.chillsubs.com${imageUrl}`
    : "";

const countriesSource: Option[] = countries.map((c) => ({
  value: String(c.code ?? "").trim(),
  label: String(c.name ?? "").trim(),
}));

/** Safe lookup from ISO/code → country name (API expects country name). */
const countryNameFromCode = (code: string): string => {
  const found = countriesSource.find((c) => c.value === code);
  return found?.label ?? code; // fall back to the code (best effort)
};

/** Guard unknown JSON shape (CountriesNow often returns { data, error, msg }). */
/** https://countriesnow.space/swagger-docs/ and Postman collection. */ // :contentReference[oaicite:1]{index=1}
const isOk = (res: any): boolean =>
  !!res && (res.error === false || res.error === undefined);

/** Normalize arrays defensively */
const asStringArray = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : [];

/** Shared fetch helper (POST JSON) with strict typing at the edge. */
const postJSON = async <T>(url: string, body: unknown): Promise<T | null> => {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
};

/** Get states for a given country code; returns [] on any issue. */
export const getStatesForCountries = async (countryCode: string): Promise<Option[]> => {
  const countryName = countryNameFromCode(countryCode.trim());
  if (!countryName) return [];

  type StatesResp = { error?: boolean; data?: { states?: { name?: string }[] } };
  const json = await postJSON<StatesResp>(
    "https://countriesnow.space/api/v0.1/countries/states",
    { country: countryName }
  ); // :contentReference[oaicite:2]{index=2}

  const rawStates = json && isOk(json) ? json.data?.states ?? [] : [];
  if (!Array.isArray(rawStates) || rawStates.length === 0) return [];

  const mapped: Option[] = rawStates
    .map((s) => String(s?.name ?? "").trim())
    .filter(Boolean)
    .map((name) => ({ value: name, label: convertCase(name) }));

  // dedupe + sort by label
  const seen = new Set<string>();
  const unique = mapped.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
  return unique.sort((a, b) => a.label.localeCompare(b.label));
};

/** Get cities for a given country code; returns [] on any issue. */
export const getCitiesForCountries = async (countryCode: string): Promise<Option[]> => {
  const countryName = countryNameFromCode(countryCode.trim());
  if (!countryName) return [];

  type CitiesResp = { error?: boolean; data?: unknown };
  const json = await postJSON<CitiesResp>(
    "https://countriesnow.space/api/v0.1/countries/cities",
    { country: countryName }
  ); // :contentReference[oaicite:3]{index=3}

  // API returns { data: string[] } for this endpoint per Postman doc. :contentReference[oaicite:4]{index=4}
  const raw = (json && isOk(json) ? (json as any).data : []) as unknown;
  const list = asStringArray(raw);

  const mapped: Option[] = list.map((city) => ({
    value: city,
    label: convertCase(city),
  }));

  const seen = new Set<string>();
  const unique = mapped.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
  return unique.sort((a, b) => a.label.localeCompare(b.label));
};

/** Get cities for a country+state; returns [] on any issue. */
export const getCitiesForState = async (
  countryCode: string,
  stateName: string
): Promise<Option[]> => {
  const countryName = countryNameFromCode(countryCode.trim());
  const state = stateName.trim();
  if (!countryName || !state) return [];

  type CitiesStateResp = { error?: boolean; data?: unknown };
  const json = await postJSON<CitiesStateResp>(
    "https://countriesnow.space/api/v0.1/countries/state/cities",
    { country: countryName, state }
  ); // :contentReference[oaicite:5]{index=5}

  const raw = (json && isOk(json) ? (json as any).data : []) as unknown;
  const list = asStringArray(raw);

  const mapped: Option[] = list.map((city) => ({
    value: city,
    label: convertCase(city),
  }));

  const seen = new Set<string>();
  const unique = mapped.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
  return unique.sort((a, b) => a.label.localeCompare(b.label));
};
