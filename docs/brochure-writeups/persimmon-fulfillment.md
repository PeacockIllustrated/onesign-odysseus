# Persimmon Fulfillment — Signage Portal

## What it is
A client-facing e-commerce-style ordering portal built for **Persimmon Homes** site managers to order construction signage for their developments. It's essentially a curated shop: browse by category, pick standard products, configure custom sizes, request bespoke signs, and check out — with admin tooling for PO upload, delivery notes, and order management.

## Key features
- Category-based product browsing + search
- Basket drawer + checkout flow
- Custom sign / custom item request paths
- Order confirmation + order history
- Admin area, PO upload, delivery-note (DN) upload
- Suggestion widget + splash screen for branded first-load

## Tech stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase · React-PDF (for order docs) · Nodemailer · Inter font.

---

## Brand identity

### Palette
| Token | Hex | Role |
|-------|-----|------|
| Persimmon Green | `#3db28c` | Primary accent |
| Persimmon Green Light | `#5ac4a1` | Hover / soft accent |
| Persimmon Green Dark | `#007961` | Pressed / deep accent |
| Persimmon Navy | `#00474a` | Headlines, dark sections |
| Persimmon Navy Light | `#006266` | Secondary dark |
| Persimmon Gray | `#F4F6F8` | Surface |
| Persimmon Gray Dark | `#E2E6EA` | Borders / dividers |
| Background | `#F8FAFB` | Page background |
| Foreground | `#1A1D21` | Body text |

### Typography
Inter (Google Font), sans-serif, antialiased.

### Design language
- Light, airy, premium e-commerce feel — white cards on off-white, thin gray borders, generous padding.
- Rounded-2xl cards with hover elevation (`hover:shadow-xl`, `-translate-y-0.5`).
- Green-on-navy accent pairing: navy headlines, green pills/CTAs, green/8 tinted chips.
- Sticky blurred header (`bg-white/95 backdrop-blur-md`) with scroll-aware shadow.
- Motion: slide-up, fade-in, drawer-in, splash-icon/wordmark entries — polished but restrained.
- Custom slim scrollbars (6px, slate thumbs).
- Logo: Persimmon icon + wordmark SVGs with a small "Signage Portal" sub-label.

### Section-styling suggestion for the brochure
Lead with Persimmon Navy (`#00474a`) as the section background or headline colour, use Persimmon Green (`#3db28c`) as the CTA/highlight accent, and keep content on an off-white (`#F8FAFB`) card with soft shadow — mirrors the portal's clean retail aesthetic.

---

**Source repo:** `C:\Users\peaco\OneDrive\Creative Cloud Files\Documents\GitHub\persimmon-fulfillment`
**Key files referenced:** `shop/app/globals.css`, `shop/app/layout.tsx`, `shop/components/Header.tsx`, `shop/app/(shop)/page.tsx`
