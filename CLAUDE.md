# Talk to Brim (DevHacks '26, Riot Track 1: Gameplay Bots)

A voice teammate (Brimstone persona) for a top-down 2D Bind **A site** attack, in real time. You talk to him out loud. He only acts on clear callouts, pushes back on vague ones, and only calls out what he can actually see.

**Niche (one sentence for judges):** a two-way comms teammate that only acts on clear callouts and only calls what it actually sees.

Full plan: `PLAN.md` (steps 0–10, contracts, timeline, cut order). Why and numbers: `RESEARCH.md` (opens the presentation). Read the relevant `PLAN.md` step before starting work on it.

## Hackathon facts
- 24 h: Sat 11/14 11:00 AM → Sun 11/15 11:00 AM ET. Feature freeze Sun 6:00 AM. Submit Devpost (3-min video + GitHub link) by 10:30 AM.
- Judging: online at 1 PM; top 5 per track present live on Zoom at 2 PM.
- Riot wants **bot → scenario → behavior trace**, plus evidence against a simpler baseline.
- Mentor (Rohan Reddy, `reference/mentor-talk-rohan.pptx`):
  - Measure **transfer**, not win rate.
  - The LLM talks and explains; fast decisions stay in code.
  - Fairness means fog of war.
  - Show failure modes and circuit breakers.
  - "Making an NPC chat is the starting line."

## Hard constraints (do not break)
- **No Valorant integration:** no mods, memory reading or overlays. Everything runs in our own web page.
- **No Riot art or audio:** icons are drawn in code; we write our own lines. Brim's voice is a picked TTS voice, **never a clone of the voice actor**.
- **The LLM never moves anything directly.** It returns structured `Action`s, Zod validates them, and game code carries them out. Speech is untrusted input.
- **API keys stay on the server** (`server/.env`, gitignored).
- **Space is reserved for push-to-talk.** Sandbox keys are P, R, L and D.
- **Always pass sim time, not wall-clock time,** to the map and effects. Learn mode (0.5× while push-to-talk is held) and seeded replays depend on it.
- Brim replies 12 words max in-game. Latency budget: ≤ 1.5 s on the keyword path, ≤ 2.5 s on the LLM path.
- Bind A only, attack side. Teleporters are left out for now.

## Architecture (two layers)
- **Fast layer (code, 20 Hz):** A*, line of sight, states (move/hold/smoke/molly/plant/retreat), goal queue. It never waits on the LLM.
- **Keyword matcher (<50 ms):** handles common calls and maps aliases through `CALLOUT_ALIASES`.
- **LLM slow path:** small fast model with tool calling, only for messy speech. Returns `BrimResponse {reply, actions, needs}`.
- **Validator:**
  - rejects non-A targets ("That's B. We're on A."), missing targets ("Smoke where?") and calls with no charges left;
  - falls back to the keyword path when the LLM times out (2 s) or returns invalid output;
  - circuit breaker: if Brim is stuck or looping for 3 s, he goes back to the scripted route.
- **Callout generator:** template lines only from real sightings ("One Heaven", "Truck clear"). Every line is a `BrimEvent` linked to a sighting.
- Shared contracts live in `shared/schema.ts` (see `PLAN.md` → Shared contracts). `RegionId` is defined there only; `web/src/map/types.ts` re-exports it, and `web/src/map/bindA.test.ts` fails if `REGIONS` and the enum drift apart.

## Stack
TypeScript everywhere (strict + `noUncheckedIndexedAccess`; relative imports use `.js` extensions); Vite 7; Canvas 2D (20 Hz sim, 60 fps render); plain HTML/CSS HUD; Node + Express (`/api/brim`, `/api/tts`); Zod 4; OpenAI SDK for LLM + TTS (local/browser fallbacks without a key); Web Speech API for speech-to-text; streaming TTS with `speechSynthesis` fallback; `AnalyserNode` drives the voice line. See `README.md` for the voice pipeline and API details.

## Where things are
| Path | What |
|---|---|
| `server/`, `shared/schema.ts` | Express API (`/api/brim`, `/api/tts`, `/api/health`) and the shared Zod contracts |
| `web/src/voice/`, `comms/`, `trace/`, `ui/waveform.ts`, `ui/subtitles.ts` | Steps 0–1 (teammate): push-to-talk, STT, TTS, conversation state, voice stage, trace export |
| `web/src/map/` | Bind A map module. See its `README.md`. API: `createMapView(canvas)` → `render(state, t)`, `spawnEffect(e, t)`, `activeSmokes(t)`, `setOptions`, `clientToWorld` |
| `web/src/ui/mapPanel.ts` | Live map + HUD strip under the voice stage, fixed clock under rAF, P/R/L/D keys, Learn-mode 0.5× while talking |
| `web/src/sim/testScene.ts` | Original 20 s visual demo, sandbox only. Main app uses `sim/round.ts` |
| `web/sandbox.html`, `web/src/sandbox/` | Dev-only map sandbox at `/sandbox.html`: scrubber, designer view (D), coordinate tool (click / shift-drag copies coords). Not in the production build |
| `PLAN.md`, `RESEARCH.md` | Plan and research |
| `reference/` | Mentor talk + kickoff deck (pptx) |
| `legacy/b-site-scaffold/` | Old B-site JS scaffold, superseded by `web/src/map/`. `rng.js` (mulberry32) is still handy for Step 3's seeded RNG |

## Map facts (`web/src/map/bindA.ts`)
- World is 1000×700. It was converted from a reference image with `world = img * 1.25 + (190, 8)`.
- Regions are checked in order and the first match wins: triple, cubby, vent, heaven, a_ct, uhall, pillar, back_site, truck, tower, default, a_short, showers, a_lobby, a_link.
- Layout decisions the user confirmed (don't "fix" these):
  - Heaven is top-right, with stairs down to back site.
  - The A CT door is on the left, going up.
  - U-Hall opens wide onto site. Its **narrow door is on the attackers' side (left), down to Pillar**.
  - Truck sits beside U-Hall and pokes into the bombsite.
  - Triple is an L with the **notch at the bottom-left**.
  - A Short opens onto site.
  - No teleporters.
- Also in `bindA.ts`:
  - `SMOKE_TARGETS`: heaven, uhall, vent, tower, truck_triple_gap
  - `PLANT_SPOTS`: default, alt
  - `DEFENDER_SPOTS`, `ATTACKER_STARTS` (short, showers)
  - `CALLOUT_ALIASES`, e.g. lamps→uhall, stairs/top→heaven, tp→a_short
- `geometry.ts`:
  - `hasLOS(a, b, smokes)` uses a 5 px grid (no height: Heaven's high ground doesn't see over cover); `findPath` is A* on a 10 px nav grid, eroded one cell, string-pulled.
  - Also: `regionAt`, `inPlantZone`, `castRay`.

## Status
- [x] Plan, research, mentor alignment
- [x] Steps 0–1: repo, Express API, voice stage, push-to-talk, TTS, subtitles, trace (teammate). Live-provider latency and real-mic checks still manual (see `README.md`).
- [x] Step 2: map module mounted below the voice stage with the HUD strip (timer · smokes · spike · mode). Stage shrinks to ~35vh on screens ≤ 1200 px tall so stage + map fit one viewport. Brim's icon pulses while his real TTS plays.
- [x] Step 3: live 20 Hz simulation, seeded fast plant, visibility, combat and Learn slowdown. See `web/src/sim/README.md` for the Step 4 handoff.
- [ ] Steps 4–10: see `PLAN.md`. **Never cut** call scoring + the transfer test, or the Step 6 failure handling.

## Commands
```bash
npm install && npm run dev       # API on 127.0.0.1:3001 + web on http://127.0.0.1:5173 (sandbox: /sandbox.html)
npm run typecheck                # web, server, shared, tests
npm test                         # contracts, API, voice, map data (bindA.test.ts), test round (testScene.test.ts)
npm run build
```
After changing `bindA.ts`, run `npm test` (regions vs `RegionId`, spots on walkable floor, A* reaches both plant spots, test round stays on the floor with no overlaps) and check the sightlines in designer view.

## Working style
- Hackathon pace: ship the MUST tier of each step first. Check the "Done when" line in `PLAN.md` before calling a step finished.
- Keep the game loop outside any UI framework state.
- Log every turn (`TurnLog`) and every Brim event (`BrimEvent`). The trace is the demo.
