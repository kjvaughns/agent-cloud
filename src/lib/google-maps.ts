// Lazy loader for the Google Maps JS API (Places library).
// Uses the Lovable-managed Google Maps connector browser key.

let loadPromise: Promise<any> | null = null;

declare global {
  interface Window {
    google?: any;
    __lovableMapsInit?: () => void;
  }
}

export function ensureMaps(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Maps unavailable on server"));
  }
  if (window.google?.maps) return Promise.resolve(window.google);
  if (loadPromise) return loadPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) return Promise.reject(new Error("Google Maps key not configured"));

  loadPromise = new Promise<typeof google>((resolve, reject) => {
    window.__lovableMapsInit = () => {
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps loaded but unavailable"));
    };
    const params = new URLSearchParams({
      key,
      loading: "async",
      callback: "__lovableMapsInit",
      libraries: "places",
    });
    if (channel) params.set("channel", channel);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return loadPromise;
}

export type AddressParts = {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export function parseAddressComponents(
  components: Array<{ types: string[]; longText?: string; shortText?: string; long_name?: string; short_name?: string }>,
): AddressParts {
  const get = (type: string, short = false) => {
    const c = components.find((c) => c.types.includes(type));
    if (!c) return "";
    return short ? (c.shortText ?? c.short_name ?? "") : (c.longText ?? c.long_name ?? "");
  };
  const streetNum = get("street_number");
  const route = get("route");
  const street = [streetNum, route].filter(Boolean).join(" ");
  const city =
    get("locality") ||
    get("sublocality") ||
    get("postal_town") ||
    get("administrative_area_level_2");
  const state = get("administrative_area_level_1", true);
  const zip = get("postal_code");
  const country = get("country", true);
  return { street, city, state, zip, country };
}
