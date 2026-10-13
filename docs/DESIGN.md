# JARVIS design and visual acceptance

Phase 4 uses charcoal surfaces, amber/gold intelligence energy and restrained cyan
system accents. Sora is the display face; Manrope is the interface face. Both are
self-hosted with their OFL license files. Original 24-unit navigation glyphs share
line weight and optical size. Color, radius and typography variables are defined
in desktop style.css; focus outlines, semantic messages and text accompany color.

The approved holographic angular J master is preserved unchanged. Tauri-generated
macOS/Windows app icons retain that artwork. The small monochrome angular J is a
purposeful simplified derivative for the tray and tiny surfaces, not a replacement
master. SVG currentColor and pale-on-dark variants, high-DPI PNGs, ICO favicon,
Apple Touch asset and manifest icons are included. The wordmark lockup is composed
with the local display font. The native tray opens the dashboard and clearly labels
that quitting the dashboard leaves the independent runtime active. It makes no
claim about microphone readiness or security state.

## Procedural presence

The body is live Three.js geometry/shaders, not a video or stock image. Native
outgoing audio amplitude and three frequency bands drive SPEAKING. LISTENING,
THINKING, ALERT and OFFLINE have distinct parameters and accessible text labels.
Core connectivity and native voice state select the mode; no production fixture
can create a false connection or conversation.

| Preset    | Points | Trails | Pixel ratio cap | Frame cap |
| --------- | -----: | -----: | --------------: | --------: |
| Cinematic | 24,000 |  1,000 |               2 |        60 |
| High      | 14,000 |    600 |            1.75 |        45 |
| Balanced  |  7,000 |    280 |            1.25 |        30 |
| Low power |  1,800 |     60 |               1 |        15 |

Hidden or offscreen canvases do not render. Reduced motion stops autonomous motion
and redraws only when state/audio/size changes, at most eight times per second.
WebGL loss has an accessible logo fallback. Renderer/observer resources are disposed.
These are configured budgets; measured GPU load/FPS still require physical review.

## Startup and preferences

A first unavailable connection may show up to five seconds of skippable assembly;
repeat launches cap it at 2.3 seconds. Real ready state dismisses the sequence
immediately. Reduced animation uses a short fade; Off opens the workspace directly.
No milestone claims readiness without actual runtime/identity evidence. Reopening
or focusing the existing window does not rerun startup. Reduced motion always
honors the system setting; the owner may additionally reduce motion in Settings.
Quality, startup and motion preferences contain no secrets and remain local.

## Visual evidence and regression

The isolated `apps/desktop/tests/visual` entry is served separately on localhost
1421 using `pnpm --filter @jarvis/desktop exec vite --config visual.vite.config.ts`.
It has no native/API/identity access and is not an entry in the production build.
It fixes the random seed and motion to capture IDLE, LISTENING, THINKING, SPEAKING,
ALERT and OFFLINE. Synthetic audio levels are explicitly labeled test input.
Structural snapshots additionally protect privacy text and accessible labels.

Pixel baselines are platform-specific Mac in-app-browser captures at 1024×768.
Capture all six settled states with the supported computer-use browser tool and
compare them with the repository image comparison command. Never compare a Mac
baseline against a different GPU/browser and silently bless differences. Review
actual screenshots before accepting a changed baseline. Never capture recovery
codes, credentials or private conversations as visual artifacts.

Review in progress: native homepage showed real local-wake state and the approved
logo. Laptop review exposed sidebar overflow and oversized header space; both were
corrected. Desktop and compact settings have been inspected; compact document width
was 640 with no horizontally overflowing controls. Final rebuilt native pages,
keyboard navigation, real speaking state, boot variants and physical acceptance
remain pending. Screenshots alone do not establish accessibility conformance.

Capture correction: initial comparisons exposed a capture before the SPEAKING
frame had settled and a pixel-ratio change during responsive inspection. The
renderer now updates its pixel-ratio budget on resize and exposes actual rendered
state/level attributes for capture readiness. Baselines were recaptured and reviewed
only after those attributes matched each requested deterministic state. Capture
readiness does not change the product state or inject operational data.

## Shared feedback and token contract

Spacing, type, radii, borders, semantic colors, control/icon sizes, focus, disabled
opacity, motion/easing, shadows and overlay layers use named CSS tokens. Notices
are inline beside their source. Each source has one current message, so repeated
poll state does not append duplicate toasts. Errors/critical states persist until
resolved or retried; informational/action status also persists until the source
clears it, with no timed dismissal or background-success toast stream. Errors use
alert semantics; informational messages use polite status semantics. Existing
purpose-bound passkey confirmations remain the authority boundary for security
changes; voice/UI styling adds no authority. Small 16px and platform tray variants,
180px Apple Touch and 192/512px manifest assets are generated from approved or
explicitly derived original artwork. Six settled visual comparisons passed with
zero changed pixels before the microphone follow-up.

Keyboard/browser follow-up: Settings is reachable with Tab/Enter. Off startup,
Low power and Reduce motion persisted through a real browser reload; the DOM
reported reduced motion active and no boot overlay appeared. Restored the original
Full/High/motion defaults afterward. These are browser preference checks; they do
not claim native physical voice or operating-system accessibility certification.
