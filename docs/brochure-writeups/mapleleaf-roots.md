# Mapleleaf Roots

## What it is
A **franchise operations platform for Mapleleaf Petroleum Group** — bespoke enterprise software built by Onesign & Digital to run Mapleleaf's forecourt franchise network across the UK. It handles the full lifecycle of a franchise site: initial fit-out → day-to-day operations → network-wide promo campaign rollouts.

Roots is the **fourth product in the Mapleleaf brand family** alongside Mapleleaf Petroleum (fuel), Mapleleaf Express (convenience), and Mapleleaf Automotive (workshop).

## Who uses it (strict four-tier hierarchy)
| Role | Scope | Primary actions |
|---|---|---|
| **HQ Admin** | Entire network | Author templates, create campaigns, manage product catalogue, moderate community board, run reports |
| **Area Manager** | Geographic area (many sites) | Onboard sites, approve deviations, view compliance |
| **Site Manager** | One site | Edit planogram within HQ rails, confirm installs, manage staff |
| **Employee** | One site, task-level | Log substitutions, install POS, report problems, confirm restocks |

## The three core modules
1. **Store Fitting Configurator** — franchisees onboard new sites by composing shop floors from a library of standard units (gondolas, chillers, till counters), which triggers an Onesign quote for all required signage and fixtures. 2D drag/drop floor plan canvas.
2. **Planogram Management** — per-site, shelf-level visibility into every product slot (main / substitute A / substitute B), employee substitution logging, real-time stocking status.
3. **Campaign System** — HQ-authored promotional campaigns targeting unit types, auto-rolled out per site with generated print packs and staff install checklists.

Plus two supporting modules: **Admin Dashboard** (network-wide compliance, rollout status, substitution trends) and **Community Board** (franchisee-submitted suggestions with HQ moderation).

## Tech stack
Next.js 15 (App Router) · TypeScript strict · Tailwind 4 + CSS custom properties · shadcn/ui (themed) · Supabase (dedicated project, Postgres + RLS + Storage + magic-link auth) · Zustand + immer · **Konva.js / react-konva** (2D floor plan canvas) · SVG shelf visualiser · `@react-pdf/renderer` (Onesign quote PDFs) · Resend (transactional email) · **Open Food Facts + Open Products Facts** nightly sync for product data · Poppins self-hosted (`@fontsource/poppins`) · PWA (Phase 3, `next-pwa`) · Vercel, subdomain `roots.mapleleafpetroleum.com` via Wix DNS.

Notable non-negotiables: no localStorage for domain data (Supabase is truth), no client-side-only state for Manager/HQ-visible info, strict role hierarchy enforced via RLS.

---

## Brand identity (Mapleleaf)

Inherits the full Mapleleaf brand pack — shared marque, typography, and colour system across all four divisions; only the division wordmark differs.

### Primary palette
| Token | Hex | Role |
|---|---|---|
| **`ml-red`** | **`#E12828`** | Primary action, the "Mapleleaf" wordmark, active states, error alerts |
| `ml-charcoal` | `#414042` | Body text, panels, secondary signage, app bar |
| `ml-light-grey` | `#E6E7E7` | Surface backgrounds, descriptor text, inactive states |

### Gold gradient — *reserved* premium accent
| Token | Hex | Role |
|---|---|---|
| `ml-gold-light` | `#F8D3A3` | Gradient stop 1 |
| `ml-gold-mid` | `#ECBB7F` | Gradient stop 2 (solid-usage default) |
| `ml-gold-dark` | `#A96533` | Gradient stop 3 |

Gold is **earned, not decorative** — quote-approval success, rollout-complete toast, PDF export headers, milestone celebrations. Never on routine cards.

### The non-negotiable rule
**Mapleleaf Red (`#E12828`) never appears on division wordmarks.** "Petroleum", "Express", "Automotive", "Roots" are always rendered in charcoal (on light) or white (on dark) — never red. Across the entire signage estate, "Mapleleaf" is the red constant; the division name is the secondary element.

### Typography — Poppins, exclusively
Self-hosted via `@fontsource/poppins`. Seven-step scale:

| Token | Weight | Size | Usage |
|---|---|---|---|
| `type-hero` | Black 900 | 36–48px | Marketing, empty-state headlines, "Mapleleaf" wordmark |
| `type-section` | Bold 700 | 22–28px | Page titles, major section headers |
| `type-subheading` | Medium 500 | 16–18px | Card titles, sub-sections |
| `type-label` | Medium 500 | 12–13px | Buttons, chips, form labels |
| `type-body` | Regular 400 | 13–15px | Prose, body copy |
| `type-caption` | Light 300 | 11–12px | Metadata, timestamps |
| `type-legal` | Light italic 300 | 11px | Legal / disclaimers |

- **Sentence case**, never Title Case.
- ALL CAPS only where brand pack prescribes (division names, directional signage).
- Hero tracking `-0.02em`; ALL CAPS labels `0.04em`.

### The marque & lockups
Mapleleaf marque = gold maple leaf with red accent stroke. App-bar icon is a red square with gold leaf. Lockups pattern:

```
Mapleleaf   PETROLEUM
  (red)     (charcoal, uppercase, 0.12em tracking)
```
Division name sits at ~60% the height of "Mapleleaf", baseline aligned, gap ~0.4em. On dark, both words go white — red version is light-background only.

### Surfaces & components
- **App bar** — charcoal (`#414042`), red icon square anchoring the left, white "Mapleleaf" + light-grey "ROOTS" separated by a subtle vertical rule. No shadow, no gradient.
- **Cards** — white, 0.5px charcoal border, 8px radius, no default drop shadow (elevation only for modals/active drags).
- **Status cards** — Mapleleaf-authored content gets a 4px red left-border. Used sparingly (active campaigns, quote cards, rollout progress) — not every card.
- **Forms** — 40px input height, 6px radius, 2px red focus ring with 2px offset, red border + helper text on error.
- **Buttons** — Primary (red / white), Secondary (charcoal / white), Outline (transparent + charcoal border), Ghost (transparent + charcoal). 40px default / 44px primary / 32px compact; 16px min horizontal padding. Destructive actions gated behind a confirmation modal (red confirm button there, never red as the only destructive colour).

### Motion & density
- Transitions: 150ms hover/focus, 200ms state, 250ms layout. Ease-out in, ease-in out. **No bounce, no elastic.**
- **Information density over whitespace** — tool used daily by managers at 7am. Row 44px, card padding 20–24px, inter-card gap 12–16px, side margins 24–32px, max content width 1440px.

### Imagery & tone
- **No stock photos, ever.** Site photos from site uploads; product images from Open Food Facts (CC-BY-SA credit retained); marketing imagery Mapleleaf-supplied. Fallback = light-grey placeholder tile with simple icon.
- Tone: plainly written, British English throughout (colour, realise, organisation, centre). "Mapleleaf" is one word. Never "guys" or "folks".

### Section-styling suggestion for the brochure
Treat the Roots section as **bold, authoritative, forecourt-industrial**. Charcoal `#414042` as the hero/app-bar band, white body surfaces, Mapleleaf Red `#E12828` used only for the "Mapleleaf" wordmark and the single primary CTA, and one small red-left-border status card to echo the in-app pattern. Mock a lockup — "Mapleleaf" in red Poppins Black 900, "ROOTS" in charcoal uppercase with wide tracking. Reserve the gold gradient (`#F8D3A3` → `#ECBB7F` → `#A96533`) for one premium moment (PDF-export headline, or an "earned" badge) to demonstrate the rule that gold = meaning. Keep corners architectural (6–8px), no drop shadows except on one elevated modal-style element.

---

**Source repo:** `C:\Users\peaco\OneDrive\Creative Cloud Files\Documents\GitHub\mapleleaf-roots`
**Key files referenced:** `README.md`, `CLAUDE.md`, `docs/BRAND.md`
