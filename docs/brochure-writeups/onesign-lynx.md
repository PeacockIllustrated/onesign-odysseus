# OneSign – Lynx (onesign-qr)

## What it is
A **business-presence platform for UK small businesses** — one dashboard that unifies bio pages, managed QR codes, NFC merchandise, review funnels, and team accounts. Built and sold under the **OneSign · Lynx** product name.

The killer feature is **managed QR codes**: the printed QR always encodes a OneSign-owned short link, and the destination can be swapped from the dashboard without reprinting. Analytics are captured at the redirect, with no PII stored.

## Key features
- **Bio Pages** — block-based editor with templates, forms, galleries, link blocks, embedded QR
- **Managed QR Codes** — print once, redirect anywhere (sub-200ms redirects)
- **Team Accounts** — multi-user orgs with owner/admin/member roles
- **Review Funnels** — smart 5★-to-Google, low-rating-to-private-feedback flows
- **Shopfront** — branded NFC cards, review boards, table talkers, A-frames (fulfilled by OneSign & Digital)
- **Privacy-first analytics** — scans/clicks tracked without storing personal data
- **Super-admin dashboard** — platform-wide visibility for OneSign staff, fully audited

## Tech stack
Next.js 14+ (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres + Auth + Storage) · `qrcode` npm · Zod validation · Upstash Redis (optional rate-limiting) · Vercel.

---

## Brand identity

### Palette — "Lynx"
Dark-mode product, anchored on **Tailwind zinc** with a signature green accent.

| Token | Hex | Role |
|-------|-----|------|
| lynx-50 | `#f3faf6` | Faintest tint |
| lynx-100 | `#def2e7` | |
| lynx-200 | `#bde6cf` | |
| lynx-300 | `#93d3b4` | |
| lynx-400 | `#6fbf98` | Headline highlight |
| **lynx-500** | **`#58a386`** | **Brand accent / primary CTA** |
| lynx-600 | `#3e8068` | Pressed |
| lynx-700 | `#336754` | |
| lynx-800 | `#2b5344` | |
| lynx-900 | `#214039` | Deepest |

**Surfaces (dark):**
- Background: `zinc-950` (hsl 240 10% 4%)
- Card / muted: `zinc-900` (hsl 240 6% 10%)
- Secondary / accent / border: `zinc-800` (hsl 240 4% 16%)
- Foreground: `zinc-50` (hsl 240 5% 96%)
- Muted text: between `zinc-400` and `zinc-500`
- Destructive: `hsl 0 84% 60%`
- Theme meta colour: `#58a386`

### Typography
**Gilroy** (local font) — Light 300 / Regular 400 / Medium 500 / Bold 700 / Heavy 900. System/sans fallback.

### Design language
- **Dark, confident, tech-forward.** Inky zinc surfaces with crisp white type and lynx-green accents picking out key words ("One confident presence").
- Big tracking-tight hero type (5xl–6xl, `leading-[1.05]`).
- Muted zinc-400 body copy with generous leading.
- `DarkShell` wrapper with optional **glow** and **grid** background effects — gives marketing pages a subtle product-photo backdrop.
- Reusable design primitives: `Eyebrow`, `Section`, `StatStrip`, `FeatureCard`, `CtaButton`.
- Small icon + label stat strips (UK-made merch, sub-200ms redirects, no lock-in) with Lucide icons.
- Rounded-lg radius (`0.5rem`), ring/focus uses lynx-500.
- Animation: subtle fade-in, slide-in-from-top/bottom, all 150–200ms; honours `prefers-reduced-motion`.
- Scrollbar-hide utility for horizontal scrollers.

### Section-styling suggestion for the brochure
Go full-dark: `zinc-950` background, zinc-900 card surfaces, zinc-800 hairline borders, body text in zinc-400, and use **`#58a386` (lynx-500)** as the sole accent — on CTAs, icons, and one or two highlighted words in the headline. Add a soft radial "glow" behind the hero and a faint grid pattern to echo the product's marketing shell. Set headlines in Gilroy Heavy/Bold, tight tracking.

---

**Source repo:** `C:\Users\peaco\OneDrive\Creative Cloud Files\Documents\GitHub\onesign-qr`
**Key files referenced:** `tailwind.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `README.md`
