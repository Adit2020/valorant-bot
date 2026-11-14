# Bind A simulation

Open the main page with `?seed=2026`. The HUD shows the unsigned 32-bit seed; R restarts it. The 800-tick scenario stops at 0:00, with Play or R starting it again. There is no win/plant timer: Sova carries the spike to Default if he survives, and drops it if killed. The scrubber at `/sandbox.html` still uses the original `testScene.ts`.

## Round and clock

`new Round(seed)`, `step()`, `reset(seed?)`, and `snapshot(designer?, alpha?)` in `round.ts` work in Node without Canvas. Each step advances exactly 50 ms. It runs the utility cue, expiry, route movement, observation, shot resolution, then final observation, in that order. Step returns the events **from this tick only**. Each includes a tick, actor ID, optional subject ID, visibility at the event, and a map effect. Reset rebuilds the agents and seeded generator. Mulberry32 is consumed once for Omen’s spot. Combat consumes no randomness; roster order breaks exact ties.

`ui/mapPanel.ts` feeds elapsed milliseconds into `FixedClock`. The clock admits at most 250 ms per frame (five ticks at 1×); longer stalls discard excess time. Paused and hidden time is discarded. Learn uses half speed only for the interval that `Conversation.isHolding` is true. Input changes settle the previous interval before switching rate. Rendering interpolates friendly movement; enemies use current visible positions. Designer view may interpolate everyone. Voice and waveform keep their original wall clock.

## Agents and combat

`plays/fastPlant.ts` defines the three Short routes, two Showers routes, departure times, final holds, and Heaven smoke cue. Friendly agents queue when a move would bring them within 18 units. Agents use A* on the eroded grid; every smoothed leg and every movement step must cross only open cells. Invalid routes return empty and the agent holds. Sova's spawn moved from (372,680) to (366,677) to fit that margin.

Jett holds Heaven, Killjoy U-Hall, Chamber Back Site and Viper Truck. Omen holds one of Tower, Cubby or Triple. Heaven and Back Site can watch Default, and Truck watches the Short exit. These are open 2D sightlines around cover; no height exception. Tower moved inside the nav margin, and U-Hall’s watch shifted five units to clear its door.

`visibility.ts` checks a 120° cone, 285-unit range, crossed floor cells, solid cover and circular smoke occlusion. A scripted smoke spends one charge on throw, lands 12 ticks later, and blocks a radius of 46 for 300 ticks. It affects both teams. Visual bloom/fade is cosmetic. Normal fog shows all friendlies and only living opponents currently seen by **Raze (the player)** or **Brim**. There is no last-known marker, and other allies’ private contacts are excluded. Kill markers at hidden enemy positions are designer-only.

`combat.ts` retains a visible target, otherwise takes the nearest visible opponent. Acquiring one takes four ticks plus one tick per 0.1 radians of initial aim error (rounded up). Movement stops during engagement. Each hit does 34 of 100 HP; a shooter waits at least five ticks between shots. Losing sight cancels acquisition. Dead agents no longer watch, move, or fire.

## Step 4 handoff

- Use `round.observations('brim')` for detached, currently visible contacts. Do not use the designer snapshot or Raze's sightings as Brim's knowledge.
- Use `round.assignRoute('brim', goals: Vec[])` at a tick boundary to replace Brim’s remaining path. An empty list holds; an unreachable goal clears the path and returns false. Brim keeps normal movement, aim and death rules.
- Replace Brim’s route and scheduled utility cue from `plays/fastPlant.ts` when adding autonomous control. Keep smoke ownership and event creation in `round.ts`.
- Subscribe to returned `RoundEvent[]` for future traces. Derive seconds from `event.tick * DT`. The renderer, audio pipeline and LLM do not call movement or advance game time.
