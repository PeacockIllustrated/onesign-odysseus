# Design Your Sign — Viral Reel (Canonical Shooting Plan v1) — Storyboard

> Result-first vertical reel for Onesign's free /design studio: slam the finished glowing sign in the first 1.5s, hold the day→night payoff hostage, race the four-step build in bold Anton kinetic type, prove it with a staccato montage of real North-East signs, and land a hard free CTA — no full-frame pulsing, all rotation, light and hard cuts.


**Format:** 9:16 (1080×1920) · **Length:** 34s · **30fps** · British English · sound-off first · **viral cut**


## Type system

Three broadcast tiers, never mixed within a role, plus a quarantined UI sans. (1) ANTON = the reel voice: every full-frame caption, ALL CAPS, line-height 0.86–0.88, letter-spacing 0 to −0.005em (eyebrows may track wider). Hero one-worders 240–340px cropping off the safe-area top+bottom; 2–3 word stacked lines 150–190px; corner/side demo labels 96–120px. Anton carries verbs and promises (DESIGN, FREE, NIGHT, WE MADE THEM). The biggest Anton words get a vertical #4e7e8c→#9ed0dc gradient fill + 1px top edge-light so the type itself reads as lit brushed aluminium. (2) ARCHIVO BLACK (900) = numbers, names and hard facts: stat slabs (4050 MM, £0, 36 LIVE ORDERS), the DSR-2026-000123 reference, the CTA URL, and real client nameplates (mixed-case allowed for names, tracking −0.02em; 90–150px stats, 64–96px names/URL). (3) ARCHIVO 800/900 = connective tissue: eyebrows/kickers, meta lines under nameplates, spec chips — ALL CAPS, 26–40px, letter-spacing +0.16 to +0.22em, ~70% opacity. (4) UI SANS (Geist/Inter 500–600) is QUARANTINED inside the frosted wizard dock only — field labels, steppers, buttons — so the app reads as the authentic product; it NEVER appears in a broadcast caption. The old weight-800 system-sans captions are retired entirely — that was the 'boring font' the client flagged.


## Colour energy

Manufacture pop from CONTRAST, SCALE and REAL-CLIENT colour — invent no new brand hue; stay anchored to steel-teal #4e7e8c / ice-glow #9ed0dc. Five moves: (1) HARD MONOCHROME BASE — push the stage to near-black and type to pure #ffffff / #e8f0f3 so slabs read as high-contrast black-and-white; the energy is the slam, not a rainbow. (2) ICE-GLOW IS THE ONLY 'BRIGHT' — reserve #9ed0dc for the one accent word per caption and every lit state; on the night ignition it overdrives to a white-hot core #c8f0fa before settling back to #9ed0dc (the single hottest frame in the film). (3) WHIP-FLASH CARDS not pulses — 2–3 frame full-bleed solid cards (ice, light, or a client's brand colour) as strobe-cut transitions inject colour rhythm with zero full-frame throb. (4) REAL-BRAND PALETTE EXPANSION — colour legitimately widens only in the montage, using genuine client hues: Black Rabbit warm, HERD neon ice, Ginger amber #f0c68a, Aqua TCG cyan, FCR blue #376fa4, Persimmon green — each nameplate's accent word painted in that client's own colour, optionally flashing full-frame for one beat, then snapping back to the Onesign steel-teal/ice system on the proof line and CTA for brand ownership. (5) GRADIENT MEGA-WORDS — the biggest Anton words carry the #4e7e8c→#9ed0dc gradient + edge-light. Steel-teal is the resting brand; ice-glow is always 'the thing lit up.'


## Motion recipes


- SNAP-ZOOM CUT (workhorse step→step): last 4f of the outgoing scene drive scale 1.0→1.18 + blur 0→6px via spring({fps,frame,config:{damping:14,stiffness:220,mass:0.6}}), then HARD CUT on the beat; incoming enters at scale 1.14→1.0 over 7f on the same spring. No crossfade — blur+scale sells momentum, the cut lands impact. Wrap each scene root in an AbsoluteFill with transform:scale + filter:blur.

- WORD-SLAM (hero caption entrance): split the line into words, delay each by 2f (frame − i*2); per word translateY 40→0 + scale 0.92→1 + opacity 0→1 on spring({damping:12,stiffness:200,mass:0.7}); load-bearing word (FREE/3D/YOUR/NIGHT) gets a 1.06 overshoot + ice-glow #9ed0dc fill or an L→R swipe-underline via clip-path inset over 4f. Leading 0.86, caps crop off the safe area. Alternate line anchoring hard-left / hard-right for a ransom rhythm. Max 5–6 words on screen.

- TEXT SHUTTER-WIPE (caption changeover): out via clip-path inset(0 0 {p*100}% 0) collapsing up in 4f; in via mirror inset({(1−p)*100}% 0 0 0); Easing.bezier(0.85,0,0.15,1) mechanical snap. Type is punched through a slot — never a soft dissolve, every caption enters and leaves on a hit.

- SIGN TURNTABLE ORBIT (continuous — replaces the banned full-frame pulse): parent perspective:1400px, transform-origin:center; the CSS-3D folded panel runs rotateY between −18°/+18° and rotateX +6°/−6° on a long standing sine Math.sin(frame/fps*0.9); the return/side-wall face is a separate skewed div, and a linear-gradient specular sheen sweeps the aluminium face tied to the rotateY value so light rakes the metal as it turns. The frame around it stays locked — motion comes from rotation + light, never breathing scale.

- SETTLE-NUDGE (beat flinch, no scale): on a cut kick the sign rotateY +7° and snap it back via spring({damping:9,stiffness:240}) so it flinches to the beat instead of throbbing.

- RAL SWATCH-SLAM (Size micro-transition): a RAL colour chip flies in from frame-right, overshoots and settles on spring({damping:11,stiffness:260}); on impact a 2f clip-path wipe L→R floods the new colour across the PANEL FACE ONLY (never the frame). Sells 'you pick the colour' in under half a second.

- MASK-WIPE ICE-GLOW REVEAL (day→night money shot): pre-render a lit night layer stacked over the flat day layer; a clip-path circle({0→140}% at 50% 46%) grows from the keyline outward over 14f on Easing.out(Easing.cubic), a 3px #9ed0dc rim riding the mask edge as an expanding box-shadow ring. 3-stage ignition, not an instant on: (a) LED tube-strike stutter opacity 0→0.4→0.1→1, (b) keyline box-shadow/drop-shadow spread 0→28px over 10f, (c) a large blurred radial halo blooms + a mirrored, gradient-masked floor reflection appears; add a slow 1.0→1.06 push-in over the ~1.5s hold so night creeps toward the viewer.

- HARD BEAT-CUT MONTAGE: zero-frame cuts locked to the music grid, one real Onesign sign per beat, each card holds 9–12f; every card enters with a 4px,−4px snap-settle so even a static image feels struck; drop a 2f #e8f0f3 white-flash frame on every 4th cut as a shutter/strobe accent. Vary each entrance (slide / neon-ignite / scale-bloom / card-flip / stamp / odometer) so six cards never feel templated.

- WHIP-FLASH CARD (rhythm without pulse): a 2–3f full-bleed solid colour card (ice #9ed0dc, light #e8f0f3, or a client brand colour) as a strobe-cut between beats.

- ODOMETER / TYPE-ON NUMBERS: mm dims (4050 × 285), the DSR-2026-000123 ref, and Persimmon 00→36 roll/type up with a tabular-monospace feel + a cursor block, Easing.out(Easing.quad) — quick then eased.

- PER-LETTER Z-DROP (Artwork step): the logo/letters land onto the panel face translateZ 60→0 with tightening shadow so built-up metal reads as standing off the surface; the projecting-blade variant hinges the blade out on rotateY 0→75° over 10f with a spring overshoot.

- WHIP PAN (lateral hand-off, best Artwork→Light as the stage turns to night): outgoing translateX 0→−180px with faked motion-blur filter:blur(interpolate(v,[0,0.5,1],[0,14,0])px) + skewX(−6°) at the midpoint; incoming enters from +180px with the mirror skew over 6f, Easing.bezier(0.7,0,0.2,1), paired with a low whoosh.

- CTA IRIS: after the proof line, collapse everything to near-black via clip-path circle({120→0}%) over 8f on Easing.inOut(Easing.cubic), then iris back open on the logo lock-up + URL — bookends the reel and forces the eye to the URL.


## Scenes


### 1. HOOK — result first — 0–2s

- **Caption (Anton (hero caption); 'FREE · IN YOUR BROWSER' kicker in Archivo Black caps):** YOU JUST DESIGNED THIS

- **Visual:** Cold open, no logo. Near-black stage; a folded-aluminium APERTURE sign SNAPS on already glowing ice-glow #9ed0dc with a keyline flare, mid-turntable orbit. Result shown before the question. A tiny Archivo-caps kicker sits low: 'FREE · IN YOUR BROWSER'. Frame holds ~0.4s on the lit sign before anything else moves; open-loop tease 'wait for the glow' implied by the still-lit keyline.

- **Motion:** SIGN TURNTABLE ORBIT already running; sign ignites via a compressed 6f MASK-WIPE ICE-GLOW flare on frame 1 (hard click SFX). Caption enters WORD-SLAM, load-bearing 'DESIGNED' in the #4e7e8c→#9ed0dc gradient. Held result-frame, then SNAP-ZOOM out on the beat into scene 2.


### 2. PIVOT — rewind to blank — 2–3.5s

- **Caption (Anton (caption); dock labels in quarantined UI sans (Geist/Inter 500–600)):** BUILD YOUR OWN SIGN — IN 4 STEPS

- **Visual:** Rewind whoosh to the raw product: a blank flat grey panel on the dark stage with the authentic frosted-white wizard dock sliding up (UI sans labels visible — Size · Artwork · Light · Send). A 4-dot Size·Artwork·Light·Send progress tracker appears top-corner and lights dot 1. Reads as a real screen-recording, not an ad.

- **Motion:** WHIP PAN in from the hook. Dock rises on a snap spring; 4-dot tracker pops in. Caption WORD-SLAM corner-locked so it never covers the dock.


### 3. STEP 1 — SIZE — 3.5–7.5s

- **Caption (Anton (caption); '4050 × 285 MM' in Archivo Black stat slab):** SIZE. COLOUR. FOLDED EDGES.

- **Visual:** Cursor drags the width handle; the panel stretches wide. Dimensions roll up as an Archivo Black stat slab locked to the left margin: '4050 × 285 MM'. The folded-aluminium return edge folds in in 3D (side-wall face catches the raking sheen). A RAL colour chip drops from frame-right and floods the panel FACE steel-teal #4e7e8c. Tracker dot 1 solid. Anton pinned to a side-rail so the sign keeps centre stage.

- **Motion:** SIGN TURNTABLE ORBIT continuous; ODOMETER roll on the mm dims; RAL SWATCH-SLAM repaints the face only; SETTLE-NUDGE on the fold beat. Exit SNAP-ZOOM to Artwork.


### 4. STEP 2 — ARTWORK — 7.5–11.5s

- **Caption (Anton (caption)):** DROP YOUR LOGO. WE CUT IT IN METAL.

- **Visual:** An SVG logo is dragged and dropped onto the panel face. Quick 3-way flip demonstrating finish: cut-in aperture → stand-off letters → built-up metal letters, each landing with depth. Tracker dot 2 lights. The real cursor stays visible for authenticity.

- **Motion:** PER-LETTER Z-DROP as the logo lands (built-up letters stand off the surface); the finish flips via three fast TEXT SHUTTER-WIPE / hard cuts; SIGN keeps orbiting. Load-bearing word 'METAL' gets the ice-glow swipe-underline. Exit WHIP PAN toward night for the Light step.


### 5. STEP 3 — LIGHT (setup + presets) — 11.5–15s

- **Caption (Anton (caption)):** NOW FLICK THE LIGHTS…

- **Visual:** The stage begins turning toward night. A finger flicks the day→night switch in the dock; colour presets rip across the sign White → Warm → Ice → Red → Blue → Green in ~1.5s as fast swatch-flicks, tension building. Tracker dot 3 lights. Deliberately withholds the full glow — the payoff is next.

- **Motion:** WHIP-FLASH CARDs punch between preset flicks (each preset ~6f); SIGN ORBIT slows slightly as it approaches the reveal; caption karaoke-loads word by word. A 6f filter-sweep + near-silence begins under the last beat to sell the drop.


### 6. THE GLOW — day→night pay-off — 15–18.5s

- **Caption (Anton (hero caption), 'NIGHT' in ice-glow #9ed0dc):** DAY. → NIGHT.

- **Visual:** The single engineered rest beat and emotional peak. Sign starts dead-flat in cold daylight over a pale steel-teal #e8f0f3 wash; on the pre-drop beat everything goes quiet ~6f, the orbit near-stops, captions clear, 'NIGHT.' stamps in. Then the FLICK: the near-black stage floods in as the day layer wipes away and the keyline/aperture edges IGNITE, overdriving to a white-hot #c8f0fa core before settling to #9ed0dc; volumetric halo + mirrored floor reflection bloom. Faint ice-tinted scanlines (~3%) + halation appear ONLY here so 'lit' reads as genuinely emissive. Held ~1.5s.

- **Motion:** MASK-WIPE ICE-GLOW REVEAL (3-stage tube-strike ignition + slow 1.0→1.06 push-in). The music DROP + sub-boom + electrical 'zzt' land exactly on ignition; glassy 'ting' as the keyline reaches full. 'DAY.' then 'NIGHT.' via WORD-SLAM, 'NIGHT' in ice-glow. Exit SNAP-ZOOM into Send.


### 7. STEP 4 — SEND + proof — 18.5–21.5s

- **Caption (Anton (caption); 'DSR-2026-000123' in Archivo Black, tabular):** SEND IT → WE QUOTE IT.

- **Visual:** Snap back to speed. Name + email flash into the dock fields (UI sans), the SEND button hits, then the success screen: a green tick and the quote reference 'DSR-2026-000123' rolling up like an odometer. Tracker dot 4 lights — all four complete. Proof the tool actually does something.

- **Motion:** ODOMETER type-on for the DSR ref (coin/notification 'pip' SFX + a colour spike); TEXT SHUTTER-WIPE on the caption; SETTLE-NUDGE on the tick. Exit SNAP-ZOOM into the montage stinger.


### 8. MONTAGE STINGER — 21.5–22.5s

- **Caption (Anton (stinger); sub-line in Archivo 800 caps):** THESE AREN'T DEMOS — real signs we've actually made

- **Visual:** Hard title card snapping the reel out of the build into portfolio-flex mode. Near-black stage; 'THESE AREN'T DEMOS' slams on in Anton ice-glow #9ed0dc, letters arriving on a hard cut with a ~60ms horizontal shutter-wipe. Sub-line in Archivo 800 steel-teal: 'real signs we've actually made'.

- **Motion:** WORD-SLAM + TEXT SHUTTER-WIPE, zero fade. Whip-cuts left into card 1. Music resolves onto the drop's main groove for the staccato run.


### 9. REAL-BRAND MONTAGE (6 cards) — 22.5–29s

- **Caption (Archivo Black (client nameplates + '36' + FCR/Persimmon wordmarks); spec chips + ribbon in Archivo 800 caps; Persimmon kicker in Anton):** REAL SIGNS. REAL NORTH-EAST BUSINESSES. BUILT HERE. → PERSIMMON: 36 LIVE ORDERS. AND COUNTING.

- **Visual:** Staccato case-file nameplates, one real Onesign sign per beat, each ~0.75s (Persimmon ~0.9s), each owning its own brand colour: (1) BLACK RABBIT — ultra-wide 14:1 CSS-3D aluminium bar slides in at −8°, 'THE WARREN' aperture cut-outs light warm-white, chip '4.05m · illuminated aperture'; (2) HERD — dark wall, 'HERD' as a single continuous neon tube (SVG stroke, ice-glow core + #4e7e8c bloom) flickering on then steady, chip 'hand-bent neon'; (3) GINGER — amber #f0c68a wash, aluminium panel scale-blooms, 'Ginger' warm-lit aperture, chip '4.4m salon frontage'; (4) AQUA TCG — cyan, fast card-flip lands 'Aqua TCG' as flat matte CUT VINYL (deliberately NO glow), chip 'cut vinyl logo'; (5) FCR — solid #376fa4 blue block stamps in, 'FCR' huge Archivo Black white + 'ROOFING & BUILDING' beneath, roof-chevron mark; (6) PERSIMMON (punchline) — green wash, 'PERSIMMON' Archivo Black wordmark (typographic recreation, not the trademarked lockup) with a live-order odometer rolling 00→36 + a pulsing 'LIVE' dot. A persistent bottom ribbon reads 'REAL SIGNS · REAL BUSINESSES · NORTH EAST'.

- **Motion:** HARD BEAT-CUT MONTAGE — per-card snap-settle, varied entrance each card (slide / neon-ignite / scale-bloom / card-flip / stamp / ODOMETER), 2f white-flash on every 4th cut, one WHIP-FLASH client-colour card between beats. No full-frame pulse anywhere. Persimmon holds a half-beat longer to let '36' land.


### 10. SOCIAL-PROOF LINE — 29–30.5s

- **Caption (Anton (hero caption); 'North East · Built here' ribbon in Archivo Black caps):** THE SIGNS YOU'VE WALKED PAST? WE MADE THEM.

- **Visual:** Palette snaps back to the Onesign steel-teal/ice system for brand ownership. Full-frame Anton line over the near-black stage, the lit hero sign faint behind: 'THE SIGNS YOU'VE WALKED PAST? WE MADE THEM.' with a small 'North East · Built here' Archivo-caps ribbon. The proof beat that earns the ask.

- **Motion:** WORD-SLAM stacked; 'WE MADE THEM.' lands last with an ice-glow underline. Reverse-cymbal/vinyl-stop tail begins under it, feeding the iris.


### 11. CTA — hard URL lock — 30.5–34s

- **Caption (Anton (slam 'FREE. NO SIGN-UP. GO BUILD ONE.'); 'onesignanddigital.com/design' in Archivo Black):** FREE. NO SIGN-UP. GO BUILD ONE. → onesignanddigital.com/design

- **Visual:** CTA IRIS closes to near-black then opens on the logo lock-up (white Onesign mark) and the URL. Anton slam 'GO BUILD ONE.' above the URL in Archivo Black, an ice-glow underline drawing L→R under the URL; kicker 'FREE. NO SIGN-UP.' The one thing they must remember, legible in a single frozen frame. Held ~2s on the URL.

- **Motion:** CTA IRIS-IN then open; URL underline swipe via clip-path inset in 4f; clean synth stab + tail. One final SETTLE-NUDGE on the logo, then lock static for the URL hold.


## Real-brand montage


21.5–29s. Social-proof line: *The signs you've walked past? We made them. — North East. Built here.*


- Black Rabbit — 'The Warren' · 4050 × 285 mm illuminated aluminium aperture (bar/pub) · ultra-wide 14:1 slide-in, aperture cut-outs lit warm-white, chip '4.05m · illuminated aperture'

- HERD · hand-bent neon · single continuous SVG neon tube, ice-glow #9ed0dc core + #4e7e8c bloom, erratic ignition then steady buzz — the only non-aluminium build, chip 'hand-bent neon'

- Ginger · 4400 × 650 mm illuminated aluminium aperture (salon) · amber #f0c68a wash, scale-bloom, warm-lit 'Ginger' aperture, chip '4.4m salon frontage'

- Aqua TCG · cut vinyl / aperture logo (trading-card shop) · fast card-flip to flat matte CUT VINYL with deliberately NO illumination, chip 'cut vinyl logo' — the fun spike

- FCR Roofing & Building · brand blue #376fa4, heading Archivo Black · solid blue block stamp, 'FCR' white + 'ROOFING & BUILDING' beneath, roof-chevron mark

- Persimmon · national housebuilder · 36 real live orders in the system · green wash, typographic Archivo Black wordmark (not the trademarked lockup), odometer 00→36 + pulsing 'LIVE' dot — the punchline, held ~0.9s


## Sound

Driving UK/garage-tinged electronic bed at ~140–150 BPM (a beat every ~12–13 frames at 30fps) — confident, a bit of North-East swagger, not corporate stock. Structure the cut to the music: a tight 4f intro riser into the first hook stamp (0–1.5s thumb-stopper); verse energy with a clear bassline the SIZE/ARTWORK/LIGHT cuts land on; a 6f filter-sweep + near-silent drop-out right before the day→night flick (the quiet sells the reveal); then the DROP — biggest bass hit of the track — landing EXACTLY on the keyline ignition (~15s). The montage rides the drop's main groove, one sign per beat; the CTA resolves on a clean stab + tail. SFX synced to frame, all ducked −6dB under the bed: pitch-rising 'thwip' whoosh on every whip pan and snap-zoom; a hard click on the hook ignition; a deep sub-boom + electrical 'zzt' tube-strike layered on the LED flicker at the flick; a glassy 'ting' as the ice-glow keyline reaches full; mechanical 'ka-chak' shutter clicks under the caption shutter-wipes and the montage white-flash frames; a coin/notification 'pip' on the DSR-2026-000123 stamp; a short filtered vinyl-stop / reverse-cymbal into the CTA iris. Everything reads sound-OFF (captions carry the full pitch); sound-ON should feel like a genuinely produced short, not a slideshow. Keep the pre-reveal drop-out truly near-silent for contrast.


## CTA

Design yours free → onesignanddigital.com/design (no sign-up, no catch)
