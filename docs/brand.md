---
type: doc
status: draft
tags: [mccormacks-4wd, brand, design-tokens, tailwind, shadcn-ui, oswald, registration-plate]
relatedTo: []
---

# McCormacks 4WD brand guide for the workshop app

Extracted with Playwright from [mccormacks4wd.com.au](https://mccormacks4wd.com.au) and the [4WD services page](https://mccormacks4wd.com.au/pages/4wd-services) on 11/11/2026. The app must feel like the same brand as the website. Status: awaiting approval.

Tokens live in `src/styles/tokens.css` and are mapped to Tailwind and shadcn/ui in `src/styles/app.css`. Preview them at `/dev/tokens`.

## What the website uses

| Element | Value on the website |
|---|---|
| Typeface | Oswald for everything (300 body, 500 headings, 700 buttons) |
| Accent | Green `#368846` (buttons, calls to action) |
| Chrome | Black `#000000` header and footer with white text at 75% opacity |
| Surfaces | White `#FFFFFF` and light grey `#F7F7F7` |
| Text | Black and near black `#121212` and `#1C1C1C` |
| Corners | 10px on buttons, inputs and images |
| Buttons | Solid green, white bold label, uppercase, letter spaced, soft shadow (0 4px 10px at 20%) |
| Logo | "4WD" wordmark in a brighter green, about `#45AD5A`, on transparent |

## Logo

- **Primary logo:** `public/logo-mccormacks.png`, the full McCormacks 4WD lockup from the website header (white "McCormacks" with the green "4WD" mark). Used on the sign in screen, the desktop sidebar and the phone top bar. The website only serves it at 204 by 40 pixels, so a vector or larger original from the client is needed before launch.
- **Compact mark:** `public/logo-4wd.png`, the "4WD" wordmark trimmed to its edges. Used only where the full lockup does not fit: the tablet navigation rail and the app icons. `public/logo.png` is its untrimmed 2000 by 2000 source.
- Use both on black only. The logo green is brighter than the button green and is kept as `--chrome-accent`.
- App icons (`pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`, `apple-touch-icon.png`, `favicon.png`) are the wordmark centred on black.

## Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FFFFFF` | `#0E0E0E` | Page |
| `--secondary`, `--muted` | `#F7F7F7` | `#1C1C1C` | Panels, table stripes |
| `--card` | `#FFFFFF` | `#161616` | Cards |
| `--foreground` | `#121212` | `#F5F5F5` | Text |
| `--muted-foreground` | `#5C5C5C` | `#A3A3A3` | Secondary text |
| `--primary` | `#368846` | `#3E9A50` | Main actions, active navigation |
| `--primary-hover` | `#2E753C` | `#48A85B` | Pressed and hover state |
| `--primary-strong` | `#2A6E38` | `#57B36A` | Green text and small labels |
| `--accent` | `#EEF6EF` | `#17301C` | Selected rows, free capacity |
| `--chrome` | `#000000` | `#000000` | Sidebar, rail, tab bar, top bar |
| `--chrome-accent` | `#45AD5A` | `#45AD5A` | Logo green, active marker on black |
| `--border` | `#E4E4E4` | `#2A2A2A` | Lines |
| `--destructive` | `#C62828` | `#EF5350` | Errors, cancel |
| `--radius` | 10px | 10px | Buttons, inputs, cards |

White on `#368846` measures about 4.4 to 1, slightly under the AA threshold for small text. Green buttons therefore always use labels of 16px or larger in semibold, and green text on white uses `--primary-strong`.

## Status colours

Colour is never the only signal. Every status has an icon and a label (see `src/components/domain/status-tones.ts`).

| Status | Light | Meaning |
|---|---|---|
| Confirmed | `#0F7B6C` teal | Confirmed and ready. Teal, so it is not confused with green action buttons |
| Checked in | `#2563C9` blue | Vehicle on site, queued |
| In progress | `#7B3FC4` purple | Being worked on |
| Awaiting approval | `#A8690A` amber | Waiting for the customer |
| Awaiting parts | `#C2500E` orange | Waiting for parts |
| Blocked | `#C62828` red | Blocked, overdue or at risk |
| Unavailable | `#6B6B6B` grey | Technician not available |
| Tentative | grey hatched | Not yet confirmed |
| Complete | foreground | Finished |

Sync state uses three quiet badges: Saved (grey), Saving (amber) and Not saved, retrying (red). Staff never see the word NetSuite.

## Typography

- **Oswald** (`--font-display`): headings, navigation, buttons and registration plates. Weights 500 and 600.
- **Inter** (`--font-sans`): body text, forms, tables and figures, with tabular numerals for hours and money. Chosen because light condensed Oswald is hard to read in dense job data on a workshop tablet.
- Both are self hosted through Fontsource so the installed app does not depend on Google Fonts.
- Uppercase is reserved for buttons and plates, matching the website's calls to action. Headings and labels use sentence case.
- Body text is 16px minimum. Keep lines under about 65 characters.

## The registration plate

The plate is the signature element (`src/components/domain/rego-plate.tsx`). Staff identify vehicles by rego, so the plate leads every job card, header and search result. Queensland plates are maroon on white. Interstate plates carry their own state colour and the state code sits under the number.

## Touch and layout

- 44px minimum touch target everywhere (`min-h-touch`). Technician primary actions are 56px (`min-h-touch-lg`).
- No hover only interactions. Focus is a 3px green outline.
- Black chrome on all sizes: sidebar on desktop, rail on tablet, bottom tab bar on phone.

## Tone of voice

The website is plain, practical and confident. Typical phrases: "done right", "keeps you moving", "ready for real-world use", "send you on your trip with confidence". The app copies that register:

- Plain verbs and short sentences. Buttons say what happens: "Confirm booking", "Start job", "Take photo".
- Workshop words, not system words: vehicle, rego, job, bay, technician, hours. Never case, task, record or sync.
- Errors say what happened and what to do next, without apology.
- Australian English: labour, tyre, colour, utilisation, rego, odometer in km.

## Services offered (drives service templates and checklists)

- **4WD servicing**: scheduled logbook servicing, engine diagnostics, fault finding, oil, filters and fluid checks, brake and steering inspections, suspension inspections, cooling system checks, battery health checks, pre-trip inspections, safety checks.
- **Pre-trip and touring preparation**: full vehicle safety inspection, battery checks, electrical system checks, suspension and load checks, tyre condition, tyre pressure assessment, fluid levels and leak inspections, touring readiness checks.
- **Vehicles serviced**: Toyota (LandCruiser, Hilux, Prado), Nissan (Patrol, Navara), Ford (Ranger, Everest), Mitsubishi (Triton, Pajero), Isuzu (D-Max, MU-X), Mazda (BT-50), Volkswagen (Amarok), RAM trucks and others, diesel and petrol.
- **Website booking form fields** (useful for the booking flow): name, email, phone, postcode, year, odometer, make, model, rego, service type (Vehicle Maintenance or Vehicle Servicing), description, appointment date and time.
