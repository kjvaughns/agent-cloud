# Match Agent Cloud's branding to Licensing, Release Center and Bankdocs

## What the three sister sites share
- **Logo:** the newer Agent Cloud mark (a different image from the one used here), in a rounded square next to the words "Agent Cloud" plus the product name in lighter grey (for example, "Agent Cloud **Licensing**").
- **Colors:** the same warm cream background, white cards, near-black text, and one muted gold. This app already looks close, but its gold, borders and greys are slightly off from theirs.
- **Buttons:** the main action is a dark "ink" pill (near-black, rounded-full). Gold is kept for highlights and links.
- **Header:** slim and sticky, with a frosted cream background, a thin bottom line, grey menu links that darken on hover, then "Sign in" and a dark "Get started" pill.
- **Footer:** the logo, a few links, "© Agent Cloud", and on tool sites a small "Powered by Agent Cloud" line.
- **Cards:** larger rounded corners and the same soft two-layer shadow.
- **Fonts:** Space Grotesk for headings and Hanken Grotesk for text. This app already uses the same fonts, so they stay.

## What changes here
1. Swap in the shared newer logo everywhere the Agent Cloud mark appears: landing page, sign-in pages, sidebar fallback, and browser tab icon. Agencies with their own logo keep theirs.
2. Add a shared wordmark that reads "Agent Cloud" with an optional grey label, matching the sister sites. The portal shows "Agent Cloud" and the admin area shows "Agent Cloud **Admin**".
3. Align the light-mode color values (gold, background, cards, borders, greys, shadows) exactly with the sister sites. Dark mode gets matching warm tones. Success, warning and error colors and the cold-lead blue stay as they are.
4. Add the dark "ink" button style and use it for the main action on the landing page, sign-in, sign-up and the landing header ("Get started"). Inside the portal, gold buttons stay where they mean "do this now".
5. Restyle the landing header and footer to the sister-site pattern. On sign-in and sign-up pages, add the same "Powered by Agent Cloud" footer.
6. Use the matching corner rounding and card shadow so cards look the same across all four sites.

## What doesn't change
Page layouts, features, wording and agency custom branding stay the same.

## One thing to confirm
Your saved brand gold is #C9A227. The sister sites use a softer, deeper gold (about #B48C3E). This plan switches to theirs so all four sites match, and updates the saved brand color to the new value. Tell me if you'd rather keep #C9A227 and have the other three sites changed instead.

## Technical details
- Download the Licensing logo from `https://id-preview--0631cc8b-3198-4b8a-a7fe-2d56106a2693.lovable.app/__l5e/assets-v1/1ef3d6e2-eaee-41fa-adb6-9e1189e2b5cc/agent-cloud-logo.jpg`. If that fails, copy Bankdocs' committed `src/assets/agent-cloud-logo.jpg` instead, then replace `src/assets/agent-cloud-logo.jpg`. `BrandLogo` keeps its API.
- New `BrandWordmark({ product? })` in `src/components/brand-logo.tsx`, used in the landing nav and footer, the auth pages and the admin layout.
- `src/styles.css` light tokens are set from the sister sites' oklch values: `--background 0.951 0.012 85`, `--foreground 0.22 0.012 85`, `--gold/--primary 0.65 0.11 80`, `--gold-deep 0.48 0.085 78`, `--muted 0.94 0.012 85`, `--muted-foreground 0.5 0.015 85`, `--accent 0.92 0.03 85`, `--border 0.89 0.015 85`, `--ink 0.21 0.01 85`, `--ink-foreground 0.96 0.01 85`, `--shadow-card`, and `--radius 0.75rem`. Existing `--gold-bright/--gold-dim/--gold-glow` are kept and re-derived. Agency theme presets are left untouched.
- Register `ink` colors in `@theme inline` and add the `ink` variant to `src/components/ui/button.tsx`.
- Update the mem:// brand rule to the new gold. Check the result with Playwright screenshots of the landing, sign-in and dashboard pages next to a Licensing screenshot.
