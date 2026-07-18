"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { COUNTRIES, STATES_BY_COUNTRY, inferCountryFromState } from "@/lib/constants/locations";

export function CountryStateSelect({
  defaultCountry,
  defaultState,
  countryName = "country",
  stateName = "state",
}: {
  defaultCountry?: string | null;
  defaultState?: string | null;
  countryName?: string;
  stateName?: string;
}) {
  const initialCountry = defaultCountry || inferCountryFromState(defaultState) || "MX";
  const [country, setCountry] = useState(initialCountry);
  const [state, setState] = useState(defaultState ?? "");

  const states = STATES_BY_COUNTRY[country] ?? [];

  function onCountryChange(next: string) {
    setCountry(next);
    // Si el estado actual no pertenece al nuevo país, se limpia.
    if (!(STATES_BY_COUNTRY[next] ?? []).includes(state)) {
      setState("");
    }
  }

  return (
    <>
      <div>
        <Label>País</Label>
        <Select name={countryName} value={country} onChange={(e) => onCountryChange(e.target.value)}>
          {COUNTRIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Estado</Label>
        <Select name={stateName} value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">— Selecciona un estado —</option>
          {states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
      </div>
    </>
  );
}
