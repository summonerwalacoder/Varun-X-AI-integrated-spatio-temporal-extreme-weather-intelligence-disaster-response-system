import { useRef, useState, type FormEvent } from "react";
import { searchPlaces, type GeoResult, placeLabel } from "../lib/geocode";
import type { Place } from "../lib/geocode";
import { Icon } from "./Icon";

export function LocationSearch({
  onSelect,
}: {
  onSelect: (place: Place) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function run(query: string) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await searchPlaces(query, ctrl.signal);
      setResults(r);
      setOpen(true);
      if (r.length === 0) setErr("No locations matched.");
    } catch {
      if (!ctrl.signal.aborted) setErr("Location search unavailable.");
    } finally {
      setBusy(false);
    }
  }

  function pick(g: GeoResult) {
    onSelect({
      name: g.name,
      district: g.admin2,
      state: g.admin1,
      country: g.country,
      lat: g.latitude,
      lon: g.longitude,
      source: "manual",
    });
    setOpen(false);
    setResults([]);
    setQ("");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(q);
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <span
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", display: "inline-flex" }}
          >
            <Icon name="search" size={15} />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 30 }}
            placeholder="Search city, district, state or PIN..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              void run(e.target.value);
            }}
            aria-label="Search location"
          />
        </div>
        <button className="btn btn-outline" type="submit" disabled={busy}>
          {busy ? "Searching..." : "Search"}
        </button>
      </form>
      {open && results.length > 0 && (
        <ul
          className="search-results"
          role="listbox"
          aria-label="Location results"
          style={{ position: "absolute", top: 40, left: 0, right: 70, zIndex: 900, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", margin: 0, padding: 4, listStyle: "none", maxHeight: 280, overflow: "auto" }}
        >
          {results.map((g) => (
            <li key={`${g.latitude},${g.longitude}`}>
              <button
                type="button"
                className="search-option"
                onClick={() => pick(g)}
                style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", color: "var(--text)", padding: "8px 10px", borderRadius: 3, cursor: "pointer", fontFamily: "var(--mono)", fontSize: 12 }}
              >
                {placeLabel(g)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && err && (
        <div className="hud" style={{ marginTop: 6 }}>
          {err}
        </div>
      )}
    </div>
  );
}