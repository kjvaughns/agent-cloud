// Lazy loader for the Google Maps JS API (Places library).
// The browser key comes from /api/public/maps-key (backed by the
// GOOGLE_MAPS_API_AC secret). Falls back to the Lovable-managed connector
// browser key, which only works on *.lovable.app / *.lovableproject.com.

let loadPromise: Promise<any> | null = null;

declare global {
  interface Window {
    google?: any;
    __lovableMapsInit?: () => void;
  }
}

async function resolveKey(): Promise<{ key: string; channel?: string }> {
  const fallbackKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as
    | string
    | undefined;
  const fallbackChannel = import.meta.env
    .VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

  try {
    const res = await fetch("/api/public/maps-key");
    if (!res.ok) {
      console.error(`[google-maps] key endpoint failed: ${res.status} ${await res.text()}`);
    } else {
      const body = (await res.json()) as { key?: string | null; channel?: string | null; error?: string };
      if (body.key) return { key: body.key, channel: body.channel ?? fallbackChannel };
      console.error(`[google-maps] ${body.error ?? "no key returned"}; using fallback key`);
    }
  } catch (e) {
    console.error("[google-maps] key endpoint unreachable:", e);
  }

  if (fallbackKey) return { key: fallbackKey, channel: fallbackChannel };
  throw new Error(
    "Google Maps key not configured (set the GOOGLE_MAPS_API_AC secret to a referrer-restricted browser key)",
  );
}

export function ensureMaps(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Maps unavailable on server"));
  }
  if (window.google?.maps) return Promise.resolve(window.google);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { key, channel } = await resolveKey();

    // Google reports key/referrer/API problems through this global, not onerror.
    (window as any).gm_authFailure = () => {
      console.error(
        "[google-maps] Google rejected the browser key for this domain. " +
          `Confirm the key allows referrer https://${window.location.host}/* and has ` +
          "Maps JavaScript API + Places API (New) enabled.",
      );
    };

    return await new Promise<any>((resolve, reject) => {
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
      s.onerror = () => reject(new Error("Failed to load Google Maps script"));
      document.head.appendChild(s);
    });
  })();

  loadPromise.catch(() => {
    // allow a retry on the next mount
    loadPromise = null;
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
