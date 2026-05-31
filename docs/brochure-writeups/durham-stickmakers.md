# Durham Stickmakers

## What it is
A full website rebuild for **Durham Stick Makers** (Registered Charity 1212357) — a County Durham charity preserving the endangered heritage craft of stickmaking. Replaces a basic Webador brochure site with a bespoke Next.js application that combines charity presence, an online shop of one-of-a-kind handmade sticks, a donation pathway with Gift Aid, and a workshop booking system.

Three audiences:
- **Visitors** learning about the craft, buying sticks, or booking workshops.
- **The charity owner** (non-technical) — needs an extremely simple admin to list products with photos.
- **Search engines** — local SEO for walking-stick / heritage-craft queries in the North East is critical.

## Key features
- **Shop** of unique handmade walking sticks (one-of-a-kind, supplies, gift vouchers, workshops as products) with category + material filters
- **Owner admin** with single-page "new listing" flow: title, price, drag-drop image uploader (up to 6, reorderable, Supabase Storage), description, materials, length, maker attribution, stock count, draft/publish
- **Stripe Checkout** for shop purchases and donations (with Gift Aid checkbox, recurring option)
- **Workshop listings + bookings** with capacity/spots-remaining logic
- **Blog CMS** (draft/publish, featured image, categories)
- **CMS-lite** for static pages (About, The Craft, Support Us) and a site_config key-value store
- **Sold badges** — unique sticks transition `'published' → 'sold'` with a visible badge
- Full SEO kit: dynamic meta, JSON-LD (Product, Event, Article, Organization), sitemap, OpenGraph/Twitter Cards, canonicals

## Tech stack
Next.js 14 (App Router) · TypeScript · Tailwind CSS v3 with custom design tokens · Supabase (**shared** instance — every table/function/policy prefixed `stick_`/`stick-`) · Supabase Auth (owner-only, no public accounts) · Supabase Storage (bucket `stick-images`) · Stripe Checkout + webhooks · `next/font/google` for DM Serif Display + Inter · Vercel.

**Critical constraint:** This project shares a Supabase with other Onesign projects. Every table, function, trigger, policy and migration file **must** be prefixed `stick-` / `stick_`. Never create unprefixed tables. Never reference tables from other projects.

## Domain model (selected)
`stick_categories` (Shepherds Crook, Thumbstick, Derby Walker, Knob Stick, Market Stick, Staff…) · `stick_materials` (Hazel, Holly, Chestnut, Ash shanks; Ram Horn, Buffalo Horn, Antler, Wood handles; Brass, Nickel, Copper collars) · `stick_makers` (members, bio, photo — used for attribution) · `stick_products` (core shop listing, price in pence, `product_type` enum, `status` enum) · `stick_product_images` · `stick_orders` · `stick_donations` (with Gift Aid flag) · `stick_workshops` + `stick_workshop_bookings` · `stick_pages` · `stick_blog_posts` · `stick_site_config`.

---

## Brand identity

**Repositioning note:** Original brown/walnut hues were replaced with slate-blue tones pulled from the charity's existing site. Token names were kept for minimal-diff migration — so `walnut` now refers to a deep slate, `driftwood` to a muted slate, etc. **Brass** is retained as the accent — slate + brass is a classic heritage combo.

### Palette
| Token | Hex | Role |
|-------|-----|------|
| `stick.walnut` | `#2F3842` | Deep slate — headlines, nav, dark UI, primary buttons |
| `stick.shale` | `#4A5563` | Medium slate — body text |
| `stick.linen` | `#FAFAF8` | Warm off-white — primary background |
| **`stick.brass`** | **`#C4A265`** | **Brass / amber — primary accent, CTAs, links, hover** |
| `stick.stone` | `#E4E7EC` | Cool pale grey — cards, secondary backgrounds, dividers |
| `stick.fell` | `#3D5E4A` | Heritage green — success states, secondary accent |
| `stick.driftwood` | `#7A8593` | Muted slate — metadata, borders |
| `stick.cream` | `#EEF0F3` | Cool pale — tags, badges, subtle fills |

### Typography
- **Headings:** DM Serif Display — product titles, hero text, all headings
- **Body:** Inter — body copy, UI, navigation
- **Accent:** Inter in caps with tracking — labels, category tags, metadata

### Design principles
1. **Clean and warm** — white-dominant (`#FAFAF8`) background with warm accents; *not* a cream/brown immersion.
2. **Let photography lead** — large product images, workshop candids, close-up material textures.
3. **Heritage without heaviness** — DM Serif for character, Inter for clarity. **No faux-rustic textures.**
4. **One-of-a-kind feel** — every product card shows maker attribution + a "One of a kind" badge.
5. **Charity credibility** — charity number in footer, donation pathway accessible but not pushy, *impact stories not guilt*.

### Component patterns
- **Product cards** — 4:3 image → DM Serif title → maker name (Inter, driftwood) → price (Inter 600) + type badge
- **Hero sections** — walnut (deep slate) background, brass accent text, DM Serif headline, Inter subtitle
- **CTA buttons** — Primary: walnut bg + linen text, hover shifts to brass bg. Secondary: outline with walnut border
- **Category pills** — cream bg + driftwood text
- **Navigation** — clean white bar, DM Serif logo left, Inter links, brass highlight for active state

### Section-styling suggestion for the brochure
Lead with a warm off-white (`#FAFAF8`) canvas, large DM Serif Display headline in deep slate `#2F3842`, Inter body in medium slate `#4A5563`. Introduce **brass `#C4A265`** as the sole accent — on the primary CTA, a single underlined link, or a "One of a kind" badge. Pair with one dark-slate panel (walnut bg, linen type, brass CTA) to echo the hero pattern. Keep photography central — a close-up of a horn handle or hazel shank carries more weight than ornament. Avoid rustic textures; the tone is *curated heritage*, not craft-fair.

---

**Source repo:** `C:\Users\peaco\OneDrive\Creative Cloud Files\Documents\GitHub\durham-stickmakers`
**Key files referenced:** `CLAUDE.md`, `tailwind.config.ts`, `package.json`
