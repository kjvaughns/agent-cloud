import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ensureMaps, parseAddressComponents, type AddressParts } from "@/lib/google-maps";

type Props = Omit<React.ComponentProps<"input">, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (parts: AddressParts) => void;
};

type Suggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

export const AddressAutocomplete = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, onSelect, className, onBlur, ...rest }, ref) => {
    const [ready, setReady] = React.useState(false);
    const [open, setOpen] = React.useState(false);
    const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
    const placesRef = React.useRef<any>(null);
    const sessionRef = React.useRef<any>(null);
    const debounceRef = React.useRef<number | null>(null);
    const wrapRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      let cancelled = false;
      ensureMaps()
        .then(async (g) => {
          const places = await g.maps.importLibrary("places");
          if (cancelled) return;
          placesRef.current = places;
          sessionRef.current = new places.AutocompleteSessionToken();
          setReady(true);
        })
        .catch(() => {
          /* fallback to plain input */
        });
      return () => {
        cancelled = true;
      };
    }, []);

    React.useEffect(() => {
      const onClick = (e: MouseEvent) => {
        if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }, []);

    const fetchSuggestions = React.useCallback((q: string) => {
      if (!ready || !placesRef.current || !q || q.length < 3) {
        setSuggestions([]);
        return;
      }
      const places = placesRef.current;
      places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        sessionToken: sessionRef.current,
        includedRegionCodes: ["us"],
      })
        .then((res: any) => {
          const list: Suggestion[] = (res.suggestions ?? [])
            .map((s: any) => s.placePrediction)
            .filter(Boolean)
            .slice(0, 5)
            .map((p: any) => ({
              placeId: p.placeId,
              primary: p.mainText?.text ?? p.text?.text ?? "",
              secondary: p.secondaryText?.text ?? "",
            }));
          setSuggestions(list);
          setOpen(list.length > 0);
        })
        .catch(() => setSuggestions([]));
    }, [ready]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      onChange(v);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => fetchSuggestions(v), 200);
    };

    const handlePick = async (s: Suggestion) => {
      setOpen(false);
      const places = placesRef.current;
      if (!places) return;
      try {
        const place = new places.Place({ id: s.placeId });
        await place.fetchFields({ fields: ["addressComponents", "formattedAddress"] });
        const comps = (place.addressComponents ?? []) as any[];
        const parts = parseAddressComponents(comps);
        onChange(parts.street || s.primary);
        onSelect?.(parts);
        // new session after selection per Places New billing semantics
        sessionRef.current = new places.AutocompleteSessionToken();
      } catch {
        onChange(`${s.primary}${s.secondary ? ", " + s.secondary : ""}`);
      }
    };

    return (
      <div ref={wrapRef} className="relative">
        <Input
          ref={ref}
          value={value}
          onChange={handleChange}
          onBlur={onBlur}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          autoComplete="off"
          className={cn(className)}
          {...rest}
        />
        {open && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.placeId}
                type="button"
                onClick={() => handlePick(s)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <div className="font-medium truncate">{s.primary}</div>
                {s.secondary && (
                  <div className="text-xs text-muted-foreground truncate">{s.secondary}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);
AddressAutocomplete.displayName = "AddressAutocomplete";
