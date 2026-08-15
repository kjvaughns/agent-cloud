import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AddressParts } from "@/lib/google-maps";
import { placesAutocomplete, placeDetails, type PlaceSuggestion } from "@/lib/places.functions";

type Props = Omit<React.ComponentProps<"input">, "onChange" | "value" | "onSelect"> & {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (parts: AddressParts) => void;
};

/**
 * Suggestions come from the server, not the Maps JS SDK: the browser key is
 * referrer-restricted to the production domain, so in-browser calls were
 * rejected on preview.
 */
export const AddressAutocomplete = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, onSelect, className, onBlur, ...rest }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [suggestions, setSuggestions] = React.useState<PlaceSuggestion[]>([]);
    const debounceRef = React.useRef<number | null>(null);
    const wrapRef = React.useRef<HTMLDivElement>(null);
    const sessionRef = React.useRef<string>(
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
    );

    const fetchSuggestionsFn = useServerFn(placesAutocomplete);
    const fetchDetailsFn = useServerFn(placeDetails);

    React.useEffect(() => {
      const onClick = (e: MouseEvent) => {
        if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }, []);

    const fetchSuggestions = React.useCallback(
      (q: string) => {
        if (!q || q.trim().length < 3) {
          setSuggestions([]);
          setOpen(false);
          return;
        }
        fetchSuggestionsFn({ data: { input: q, sessionToken: sessionRef.current } })
          .then((list) => {
            setSuggestions(list);
            setOpen(list.length > 0);
          })
          .catch((e: unknown) => {
            console.error("[address-autocomplete] suggestion fetch failed:", e);
            setSuggestions([]);
          });
      },
      [fetchSuggestionsFn],
    );

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      onChange(v);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => fetchSuggestions(v), 250);
    };

    const handlePick = async (s: PlaceSuggestion) => {
      setOpen(false);
      try {
        const parts = await fetchDetailsFn({ data: { placeId: s.placeId } });
        if (parts) {
          onChange(parts.street || s.primary);
          onSelect?.(parts);
        } else {
          onChange(s.primary);
        }
      } catch {
        onChange(`${s.primary}${s.secondary ? ", " + s.secondary : ""}`);
      }
      sessionRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
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
                onMouseDown={(e) => e.preventDefault()}
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
