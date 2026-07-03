# Motion Bible — Design Your Sign reel

The reusable motion-design system the Remotion build follows. Brand palette: accent `#4e7e8c` (resting), glow `#9ed0dc` (active/lit), light `#e8f0f3` (text/glass), near-black stage.


## Principles


- OVERSHOOT-AND-SETTLE, NEVER LINEAR. Every element enters with one controlled overshoot (~4-6% past target) then settles via studioSpring — reads as confident engineering, not bounce. Reserve heavier overshoot for the day→night hero beat only.

- ONE HERO MOVE PER SCENE. Each scene has exactly one primary motion the eye tracks (sign resizing, the SVG punching into the face, the night glow igniting). Dock, HUD and captions stay quieter — lower amplitude, shorter travel, no competing overshoot.

- THE SIGN IS ALWAYS ALIVE. The 3D sign holds a continuous slow Y-axis idle (~8° peak-to-peak sine, 6s period) beneath all scene animation; transitions ride on top of the idle and never replace it, so the stage always breathes.

- FROSTED-GLASS DEPTH ORDER, never violated: (1) dark stage + 3D sign at back, (2) frosted white wizard dock mid-layer (24px backdrop-blur, 88% white fill, 1px #4e7e8c/40% hairline), (3) spec HUD + view/day-night toggles as top UI, (4) kinetic captions as the frontmost broadcast layer with a 40px soft shadow so they read over any stage brightness.

- SOUND-OFF FIRST. Captions are the narrative spine, timed to land ~4 frames BEFORE the visual they describe resolves, so a muted viewer reads intent then sees payoff. Nothing critical is carried by audio alone.

- MOTION SERVES THE PRODUCT DEMO. This is a product film, not a title sequence — every camera and UI move mimics real interaction (a slider dragging, a file dropping, a switch flicking). No decorative parallax except the single night-ignite sparkle.

- THE STEPPER IS THE MASTER CLOCK. The labelled pill Size · Artwork · Light · Send is persistent from Scene 2. The active step fills #4e7e8c→#9ed0dc and a 2px underline wipes L→R on each advance, giving a constant, legible sense of forward motion the viewer feels as pacing.



## Scene transitions


- STAGE PUSH (default scene-to-scene): outgoing content scales to 1.04 and fades over ~10f while incoming starts at scale 0.98 / y+24px and settles on studioSpring; the 3D sign itself never cuts — it continues its idle and re-frames so the stage feels like one unbroken take. 8f crossfade. Used between Size→Artwork→Light beats.

- DOCK SLIDE (wizard step change): the frosted dock's inner content wipes upward — old fields translateY -16px + fade (8f), new fields translateY from +16px + fade via studioEntrance (12f) — while the dock glass shell stays perfectly still. Same tool, next step.

- APERTURE CUT-IN (Scene 5 hero): the dropped SVG animates as a mask subtracted from the aluminium face — a white→#9ed0dc keyline traces the glyph path (stroke-dashoffset draw, 18f, studioDraw) then the interior punches through (inner fill scales 1→0 with a 6f darkening) to reveal the aperture; a 3px #9ed0dc rim-light flashes on the punch-through frame.

- DAY→NIGHT DISSOLVE (Scene 7 signature): a soft-edged luminance gradient mask (120px feather) sweeps the stage top→bottom from #e8f0f3-tinted day to near-black over 20f on studioNight; as the wipe front crosses each sign edge, that edge's glow ignites in sequence (top f0, sides f4/f6, bottom f9), each a 0→100% emissive ramp over 6f overshooting to a white-hot #c8e8ef core before settling to #9ed0dc. The one transition allowed extra drama.

- TOGGLE FLICK (view + day/night switches): the marquee knob travels on studioFlick (~55% overshoot, 9f), the track fill crossfades, and a 2px ring pulses out from the knob (scale 1→1.6, fade) as a tactile click cue synced to the SFX.

- HUD RE-TYPE (spec chip updates on size change): numeric values roll — old digits blur+lift out (4f), new digits blur+drop in (6f) per changed field, staggered 2f L→R, so 400→600 feels mechanical and precise, not a plain crossfade.

- SUCCESS BLOOM (Scene 10): the Send CTA collapses to a dot, a soft #9ed0dc radial bloom expands (scale 0→1.4, 14f studioEntrance) and resolves into the success card + DSR reference, whose final digits count up over 10f. Warm and resolved — no overshoot; this is the landing.



## Easings


- studioSpring — Remotion spring({ config: { damping: 18, stiffness: 170, mass: 0.9 } }); ~24f to rest, ~5% overshoot. Default for entrances and the sign re-frame.

- studioEntrance — cubic-bezier(0.16, 1, 0.3, 1), 12f (400ms). Dock content, captions, HUD chips settling. (theme EASE.out)

- studioExit — cubic-bezier(0.4, 0, 1, 1), 8f (267ms). All outgoing/fade-away elements — faster out than in.

- studioFlick — cubic-bezier(0.34, 1.56, 0.64, 1), 9f (300ms). Toggles and switch knobs ONLY. (theme EASE.pop)

- studioNight — cubic-bezier(0.65, 0, 0.35, 1), 20f (667ms) for the day→night luminance wipe — long and cinematic. (theme EASE.inOut)

- studioDraw — cubic-bezier(0.45, 0, 0.15, 1), 18f (600ms) on stroke-dashoffset for the aperture keyline and any path draw-on.

- studioIdle — pure sine (not a bezier): rotationY = 4° * sin(2π·frame/180) at 30fps (6s period). Continuous under everything.

- GLOBAL: 30fps; durations quoted in frames and ms. Never linear except the idle sine and constant progress fills. Stagger children 2-3f.



## Kinetic type


Two type roles, Geist Sans (brand) with Inter Tight fallback. HEADLINE captions (the narrative beats) set 84-104px, weight 700, tracking -2%, colour #e8f0f3 with a 40px soft shadow (rgba(0,0,0,0.45)); they enter by masked line-reveal — text behind a clip-rect that wipes up over 12f (studioEntrance) while the line translateY from +28px, a clean slot-machine rise, one line at a time, 3f stagger; exit via studioExit fade + 12px lift. Max 2 lines, ~5 words per line — thumb-stopping, not paragraphs. LABEL/UI type (stepper, spec HUD '2400 × 400 × 50 mm · Aluminium', trust line) set 28-34px, weight 500, tracking +2%, uppercase for the stepper only; the active stepper word animates weight 500→600 and colour #7f9aa3→#9ed0dc with a 2px underline wipe L→R on each advance. KEY WORDS get accent treatment — within a white headline the benefit word ('PREMIUM', 'glow', 'Free') is coloured #9ed0dc and, if it names light, given a subtle 8px #9ed0dc text-glow that pulses up on the night beat. HUD numbers use the HUD RE-TYPE blur-lift roll. Everything bottom-third-safe: captions stay above ~1500px from top on the 1080×1920 canvas so platform UI never covers them. British spelling throughout ('colour', 'no-obligation', 'millimetres').


## Colour usage


Four-colour discipline mapped to state. Near-black stage (#1a242a→#080c0f day / #0a1014→#020405 night, vertical radial) is the constant backdrop and dominates ~70% of frame. #e8f0f3 (light) is TEXT + the frosted dock glass + the aluminium day face — clarity and the day mood. #4e7e8c (steel-teal) is the RESTING brand colour: inactive stepper fill, dock hairline borders (1px at 40%), idle toggle tracks, secondary UI — engineered and calm. #9ed0dc (glow) is strictly the ACTIVE / LIT / ENERGY colour: current stepper step, hover/active states, the aperture keyline flash, all night edge-glow, key benefit words, the success bloom — the viewer learns teal=available, ice-glow=alive. DAY→NIGHT HERO (Scene 7): start in day — stage lifted with a 12% #e8f0f3 overlay, bright matte-aluminium face, zero glow; on the flick, studioNight wipe drains the overlay to 0, stage falls to near-black, and each folded edge ignites #9ed0dc in sequence with a brief white-hot #c8e8ef core; a soft 200px #9ed0dc radial ambient (18% opacity) blooms behind so the stage is lit by the sign. Glow swatches tease Warm then Blue for 6f before landing on brand Ice #9ed0dc. Keep #4e7e8c present in the dock borders even at night so brand identity survives the dark. NEVER put #4e7e8c text on the near-black stage (fails contrast) — teal is for lines and fills only; stage text is always #e8f0f3 or #9ed0dc.


## Sound


MUSIC: one unbroken bed — modern minimal-electronic premium product film (warm analog sub-bass + clean plucked synth arp + soft felt-piano accents; Apple-keynote-meets-workshop, never corporate). 100 BPM so 1 beat = 18 frames at 30fps; the edit cuts to this grid. 0-3.5s minimal pulse+sub (hook); 3.5-19.5s arp enters and builds (Size/Artwork momentum); at 23s a deliberate 1-beat DROPOUT / held breath right before the day→night wipe; 23-28s bass + warm pad swell back as night ignites (emotional peak); 28-38s resolve to a warm sustained major pad + single piano motif under Glow/Send/Success (calm, trustworthy). Master ~-14 LUFS for social. SFX HIT POINTS (each also 'feels' right sound-off via its synced visual pulse): (1) f0 hook — soft deep boom as the sign settles. (2) Each stepper advance — a short dry mechanical tick, at Size→Artwork→Light→Send. (3) Size change — a subtle rubber drag/detent whoosh, pitched up with size. (4) SVG drop — a tactile thunk + rising shimmer as the keyline traces, then a short punch transient at cut-through. (5) Toggle flicks (view + day/night) — a satisfying clack on the studioFlick overshoot. (6) THE NIGHT IGNITE (peak) — sits on the 23s dropout: a soft inhale riser (12f) resolving into a warm whoomp + delicate glass-shimmer grains staggered to the edge-ignition frames. Signature moment. (7) Send — a confident single swoosh on CTA collapse, then a warm ascending two-note confirmation chime as the success bloom resolves and the DSR reference counts up. Keep SFX sparse and expensive — ~9 hits total; the silence between them is what makes them land. A full sound-off caption pass carries the message regardless.
