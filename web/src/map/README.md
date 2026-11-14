# Bind A map module (Step 2)

Top-down Bind A site: map data, renderer, agent icons, and animated smokes / mollies / flashes / spike / kills / callout pings. Everything is drawn in code; no Riot art. No dependencies beyond a browser Canvas (and the `RegionId` type from `shared/schema.ts`).

| File | What it holds |
|---|---|
| `types.ts` | `AgentView`, `MapState`, `MapEffect`, `MapOptions`. `RegionId` is re-exported from `shared/schema.ts` (single source of truth) |
| `bindA.ts` | Map data: regions/callouts, cover (Truck, Triple L, Pillar, boxes), bombsite outline, Heaven ledge, smoke targets, plant spots, defender spots, attacker starts, `CALLOUT_ALIASES` |
| `geometry.ts` | `regionAt`, `hasLOS` (walls + cover + smokes), `castRay`, `findPath` (A*), `inPlantZone`. Pure; safe to import from Node tests |
| `theme.ts` | Every color and size |
| `icons.ts` | Agent icons: role letter, tag, facing tick, HP ring, Brim ring, spike carrier, flashed halo, speaking pulse, dead X |
| `effects.ts` | Smoke, molly, flash, kill burst + kill feed, callout pings (timings in `TIMING`) |
| `render.ts` | `createMapView(canvas)`: draw order, cached static layer, designer view, spike drawing |
| `index.ts` | Re-exports (pulls in canvas code; Node-side code should import `bindA.js` / `geometry.js` directly) |
| `bindA.test.ts` | Regions match `RegionId`, labels sit in their region, aliases unique, key spots on walkable floor, A* reaches both plant spots, smokes block sight |

## Use
```ts
import { createMapView } from '../map/index.js';

const map = createMapView(canvas);                       // canvas fills its parent's width, 10:7
map.render(state, simTime);                              // every frame
map.spawnEffect({ type: 'smoke', from, to }, simTime);   // smoke | molly | flash | kill | ping
map.activeSmokes(simTime);                               // smokes blocking sight, for hasLOS()
map.setOptions({ showLabels: true, designerView: false, showNav: false });
```
- **Always pass sim time** (not wall-clock), so Learn mode slow-mo and replays apply to effects too.
- Set `agent.speaking = true` while Brim's TTS plays to get the amber pulse on his icon (`ui/mapPanel.ts` does this from the conversation state).
- The page mounts it in `ui/mapPanel.ts`; the dev sandbox at `/sandbox.html` (`src/sandbox/`) adds a scrubber and a coordinate tool.

## Reuse in later steps
- **Step 3 (game loop):** `hasLOS(a, b, map.activeSmokes(t))` for who-sees-whom; `findPath()` for movement.
- **Step 4 (Brim agent):** `SMOKE_TARGETS`, `PLANT_SPOTS`, `DEFENDER_SPOTS`, `regionAt()` for "what can Brim see, where is it".
- **Step 6 (keyword matcher):** `CALLOUT_ALIASES` maps what players say ("lamps", "tower", "bath", "tp") to region ids. Match longest phrases first.

## Tweaking the layout
The layout is a simplified schematic, not a trace of Riot's minimap. To adjust it:
1. Open `/sandbox.html`, shift+drag over the area to copy a rectangle (click copies a point).
2. Paste it into the region's `rects` in `bindA.ts`.
3. Run `npm test` and check the sightlines in designer view (D).

**Known issue:** the `heaven`, `back_site` and `truck` entries in `DEFENDER_SPOTS` can't see their own `watch` point (Triple/Truck cover is in the way; `hasLOS` has no height, so Heaven doesn't see over cover). Fix before Step 3 duels depend on them.
