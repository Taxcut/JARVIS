# Isolated visual captures

Start from the repository root:

```sh
pnpm --filter @jarvis/desktop exec vite --config visual.vite.config.ts
```

This entry has no native invocation or connected services. Its preference storage
belongs to the isolated test origin; do not serve it from the production origin.
Use the config above so bundled fonts and brand assets resolve. Capture with the
supported browser tool, after fonts and the rendered state are visible. Keep the
same browser, scale and viewport for both captures. Review actual pixels before
accepting a baseline; do not increase tolerances to conceal missing content.

| File                         | Query at localhost:1421    | Viewport  |
| ---------------------------- | -------------------------- | --------- |
| product-diagnostics.jpg      | ?view=diagnostics          | 1024×768  |
| product-settings.jpg         | ?view=settings             | 1024×1024 |
| product-compact-settings.jpg | ?view=settings             | 640×1000  |
| product-model-loading.jpg    | ?view=voice&phase=STARTING | 1024×900  |
| product-confirmation.jpg     | ?view=confirmation         | 1024×768  |

For confirmation, open Revoke session; Cancel starts focused. No real session is
changed. For model loading, wait for data-rendered-state=THINKING; also capture
again after resizing away and back to catch cleared reduced-motion frames.
Product fixtures force High quality and reduced motion for deterministic pixels.

```sh
pnpm visual:compare /absolute/capture/directory --product
```

The existing six body captures use the default entry, High quality, reduced motion,
seed 41 and 1024×768. Select each body state and save fixture-STATE.jpg (lowercase).
Compare without --product. These are Mac browser regressions, not proof of native
Windows rendering, physical voice behavior or production operational state.
