// components/Location.tsx
import { useEffect, useMemo, useState } from "react";
import { countries } from "@/data/locations/countries";
import {
  getCitiesForCountries,
  getCitiesForState,
  getStatesForCountries,
  type Option,
} from "@/utils/location";
import { VirtualizedCombobox } from "./ui/combobox";

type LocationForm = {
  country: string;
  state: string;
  city: string;
  pincode: string;
};

interface LocationProps {
  form: LocationForm; // all strings, never null
  setField: (field: keyof LocationForm, value: string) => void;
}

const countriesSource: Option[] = countries.map((c) => ({
  value: String(c.code ?? "").trim(),
  label: String(c.name ?? "").trim(),
}));

const Location: React.FC<LocationProps> = ({ form, setField }) => {
  // Typed local state
  const [provinces, setProvinces] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [loadingStates, setLoadingStates] = useState<boolean>(false);
  const [loadingCities, setLoadingCities] = useState<boolean>(false);
  const [errorStates, setErrorStates] = useState<string>("");
  const [errorCities, setErrorCities] = useState<string>("");

  // derived booleans
  const showStateSelect = provinces.length > 0;
  const showCitySelect = form.country !== "" && (!showStateSelect || form.state !== "");

  // Fetch states when country changes
  useEffect(() => {
    const fetchStates = async () => {
      const code = form.country.trim();
      setProvinces([]);
      setCities([]);
      setErrorStates("");
      setErrorCities("");

      if (!code) return;

      setLoadingStates(true);
      try {
        const states = await getStatesForCountries(code);
        setProvinces(states);
        if (states.length === 0) {
          // No states for this country → prefetch cities by country
          setLoadingCities(true);
          const initialCities = await getCitiesForCountries(code);
          setCities(initialCities);
          setLoadingCities(false);
        }
      } catch (e) {
        setErrorStates("Could not load states. You can type it below.");
      } finally {
        setLoadingStates(false);
      }
    };

    fetchStates();
  }, [form.country]);

  // Fetch cities when state changes (only for countries that have states)
  useEffect(() => {
    const fetchCitiesByState = async () => {
      if (form.country === "" || form.state === "" || provinces.length === 0) return;

      setLoadingCities(true);
      setErrorCities("");
      try {
        const list = await getCitiesForState(form.country, form.state);
        setCities(list);
      } catch {
        setErrorCities("Could not load cities. You can type it below.");
      } finally {
        setLoadingCities(false);
      }
    };

    if (form.state && provinces.length > 0) {
      fetchCitiesByState();
    }
  }, [form.state, form.country, provinces.length]);

  // Handlers — always write strings (never nulls)
  const handleCountryChange = (value: string) => {
    const next = value || "";
    setField("country", next);
    // reset dependent fields
    setField("state", "");
    setField("city", "");
  };

  const handleStateChange = (value: string) => {
    const next = value || "";
    // toggle off if same, but keep string
    const final = next === form.state ? "" : next;
    setField("state", final);
    setField("city", "");
  };

  const handleCityChange = (value: string) => {
    const next = value || "";
    setField("city", next === form.city ? "" : next);
  };

  // Fallback flags: if we have *no* options (or an error), show inputs
  const useStateInputFallback = form.country !== "" && provinces.length === 0;
  const useCityInputFallback = showCitySelect && cities.length === 0;

  const statePlaceholder = useMemo(() => {
    if (loadingStates) return "Loading states...";
    if (errorStates) return "Type state/province";
    return "Select state/province";
  }, [loadingStates, errorStates]);

  const cityPlaceholder = useMemo(() => {
    if (loadingCities) return "Loading cities...";
    if (errorCities) return "Type city";
    return "Select city";
  }, [loadingCities, errorCities]);

  return (
    <div className="flex flex-col gap-6">
      {/* Country */}
    <div>
      <label htmlFor="country-input" className="block text-sm text-muted-foreground">
        Country
      </label>
      <input
        id="country-input"
        className="mt-1 w-full rounded-lg border px-3 py-2"
        value={form.country}
        onChange={(e) => handleCountryChange(e.target.value)}
        placeholder="Select country"
      />
      {form.country === "" && (
        <p className="text-sm text-muted-foreground mt-1">
        Please select a country to proceed
        </p>
      )}
    </div>

      {/* State / Province */}
      {form.country !== "" && (
        <div>
          {useStateInputFallback ? (
            <>
              <label htmlFor="state-input" className="block text-sm text-muted-foreground">
                State/Province
              </label>
              <input
                id="state-input"
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.state}
                onChange={(e) => handleStateChange(e.target.value)}
                placeholder={statePlaceholder}
              />
              {(loadingStates || errorStates) && (
                <p className={`text-sm mt-1 ${errorStates ? "text-destructive" : "text-muted-foreground"}`}>
                  {loadingStates ? "Loading states..." : errorStates}
                </p>
              )}
            </>
          ) : (
            <>
              <VirtualizedCombobox
                id="state"
                label="State/Province"
                value={form.state}
                options={provinces}
                onChange={handleStateChange}
                disabled={form.country === "" || loadingStates}
                placeholder={statePlaceholder}
              />
              {(loadingStates || errorStates) && (
                <p className={`text-sm mt-1 ${errorStates ? "text-destructive" : "text-muted-foreground"}`}>
                  {loadingStates ? "Loading states..." : errorStates}
                </p>
              )}
              {form.country && !form.state && !loadingStates && !errorStates && (
                <p className="text-sm text-muted-foreground mt-1">
                  Please select a state/province or continue
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* City */}
      {showCitySelect && (
        <div>
          {useCityInputFallback ? (
            <>
              <label htmlFor="city-input" className="block text-sm text-muted-foreground">
                City
              </label>
              <input
                id="city-input"
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.city}
                onChange={(e) => handleCityChange(e.target.value)}
                placeholder={cityPlaceholder}
              />
              {(loadingCities || errorCities) && (
                <p className={`text-sm mt-1 ${errorCities ? "text-destructive" : "text-muted-foreground"}`}>
                  {loadingCities ? "Loading cities..." : errorCities}
                </p>
              )}
            </>
          ) : (
            <>
              <VirtualizedCombobox
                id="city"
                label="City"
                value={form.city}
                options={cities}
                onChange={handleCityChange}
                disabled={loadingCities || (showStateSelect && form.state === "")}
                placeholder={cityPlaceholder}
              />
              {(loadingCities || errorCities) && (
                <p className={`text-sm mt-1 ${errorCities ? "text-destructive" : "text-muted-foreground"}`}>
                  {loadingCities ? "Loading cities..." : errorCities}
                </p>
              )}
              {form.city === "" && !loadingCities && !errorCities && (
                <p className="text-sm text-muted-foreground mt-1">
                  Please select a city or continue
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Pincode */}
      <label className="block">
        <span className="text-sm text-gray-600">Pincode</span>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2"
          value={form.pincode}
          onChange={(e) => setField("pincode", e.target.value)}
          placeholder="Enter pincode"
          inputMode="numeric"
          autoComplete="postal-code"
        />
      </label>
    </div>
  );
};

export default Location;
