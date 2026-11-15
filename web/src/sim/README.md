# Bind A simulation

Open the main page with `?seed=2026`. The HUD shows the unsigned 32-bit seed; R restarts it. The 800-tick scenario stops at 0:00, with Play or R starting it again. There is no post-plant outcome timer: Sova carries the spike, plants after 80 uninterrupted ticks at Default, and drops it if killed while carrying. The scrubber at `/sandbox.html` still uses the original `testScene.ts`.

## Round and clock

`new Round(seed)`, `step()`, `reset(seed?)`, and `snapshot(designer?, alpha?)` in `round.ts` work in Node without Canvas. Fresh rounds start in buy with `round.play === null`. Feed unscaled active milliseconds to `round.advanceBuy(elapsedMs)`; at 15,000 ms it selects Fast Plant and returns true once. Alternatively `round.selectPlay(id)` starts the chosen play once. The map panel settles elapsed time before accepting a call. Pause and hidden tabs suspend the clock. During buy, `step()` is inert. Each live step advances exactly 50 ms. It expires clouds, computes current sight, runs Brim’s controller, moves agents, resolves combat from fresh sight, then publishes final sight and closes work on death or timeout. Step returns the events **from this tick only**. Each includes a tick, actor ID, optional subject ID, visibility at the event, and a map effect. Reset rebuilds the agents and seeded generator. Mulberry32 is consumed once for Omen’s spot. Combat consumes no randomness; roster order breaks exact ties.

`ui/mapPanel.ts` feeds elapsed milliseconds into `FixedClock`. The clock admits at most 250 ms per frame (five ticks at 1×); longer stalls discard excess time. Paused and hidden time is discarded. Learn uses half speed only for the interval that `Conversation.isHolding` is true. Input changes settle the previous interval before switching rate. Rendering interpolates friendly movement; enemies use current visible positions. Designer view may interpolate everyone. Voice and waveform keep their original wall clock.

## Agents and combat

The selected [play definition](../plays/README.md) supplies spawns, routes, speeds, departure times, final holds and Brim’s recovery route. Only the other attackers start with scripted movement. Friendly agents queue when a move would bring them within 18 units. Agents use A* on the eroded grid; every smoothed leg and every movement step must cross only open cells. Invalid routes return empty and the agent holds. Sova's spawn moved from (372,680) to (366,677) to fit that margin.

Jett holds Heaven, Killjoy U-Hall, Chamber Back Site and Viper Truck. Omen holds one of Tower, Cubby or Triple. Heaven and Back Site can watch Default, and Truck watches the Short exit. These are open 2D sightlines around cover; no height exception. Tower moved inside the nav margin, and U-Hall’s watch shifted five units to clear its door.

`visibility.ts` checks a 120° cone, 285-unit range, crossed floor cells, solid cover and circular smoke occlusion. A smoke goal spends one charge on deployment, lands 12 ticks later, and blocks a radius of 46 for 300 ticks. It affects both teams. Visual bloom/fade is cosmetic. Normal fog shows all friendlies and only living opponents currently seen by **Raze (the player)** or **Brim**. There is no last-known marker, and other allies’ private contacts are excluded. Kill markers at hidden enemy positions are designer-only.

`combat.ts` retains a visible target, otherwise takes the nearest visible opponent. Acquiring one takes four ticks plus one tick per 0.1 radians of initial aim error (rounded up). Movement stops during engagement. Each hit does 34 of 100 HP; a shooter waits at least five ticks between shots. Losing sight cancels acquisition. Dead agents no longer watch, move, or fire.

## Live controller and handoff

Normal rounds enqueue the selected play’s goals at plan priority. The Step 4 live drill retains **move A Short → smoke Heaven → plant Default**. Sova owns the spike in this lineup, so the last goal resolves to covering him. Brim works from a frame containing his position, his own detached contacts from `round.observations('brim')`, and the living carrier’s ID. He cannot access the roster, designer snapshot, or Raze’s contacts. On first sight (or reacquisition) he records the contact and can interrupt to watch its observed angle for 20 ticks. Limit: one reaction per 20 ticks, none while tactical work is pending. Losing sight marks the last observed region and tick as historical; it does not update that enemy’s position. Combat still requires current sight.

| Action | What completes it |
| --- | --- |
| move(region) | Reach an open nav cell in the actual callout. Pick the cell nearest its label, then A* from the current position. |
| hold(region) / wait | Stop here for 20 ticks, watching the callout / holding the current watch angle. Idle movement stays stopped afterward. |
| smoke(region) | Round spends one of three charges and emits one overhead drop. Legal targets: Heaven, U-Hall, Vent, Tower, or Truck (the Truck–Triple gap). Only the open landing spot matters for sky delivery. The cloud blocks sight starting 12 ticks later for 300 ticks. |
| molly(region) | Spend the single charge and emit the seven-second fire effect only if the line from Brim to the target clears solid geometry. Smoke is not a wall. No damage or displacement. |
| plant(default/alt) | Carrying: reach the exact plant spot, check open plant-zone floor, stop, channel for 80 uninterrupted ticks, then remove ownership and publish planted state. Another living carrier: take an offset covering position and watch the plant spot for 20 ticks. Dropped/already planted: fail; no pickup or transfer. |
| fallback / go | Retreat to Brim’s play-specific spawn via A*, or follow his selected scripted route to its final hold. Brim cannot shoot while retreating or planting. |

**Queue API (available without a browser):**

```ts
const id = round.brim.addGoal({ type: 'smoke', target: 'heaven' }); // number
round.brim.addGoal({ type: 'plant', target: 'default' }, 'command');
// Options: 'plan' | 'command' (default) | 'tactical'.
round.brim.cancelGoal(id); // cancel this ID on the next step
round.brim.clearGoals();   // cancel all currently pending IDs on the next step
round.brim.inspect();      // detached state, activeId, ordered queue, goal history/progress, knownEnemies
round.brim.events();       // detached BrimEvent[] in emission order; t is simulation seconds
```

The mounted panel exposes the current controller as `mapPanel.brim`. In `main.ts`, the live branch of `ConversationDependencies.reply(transcript, signal)` is the Step 6 integration point. After validating a live action and checking cancellation and `inspect().closed`, submit it with `mapPanel.brim.addGoal(action, 'command')`. Return a `ReplyResult` to Conversation for subtitles, history and speech. Submission queues work; only `round.step(): RoundEvent[]` advances it. Each goal has a round-local ID. Highest priority first, FIFO within a priority. Goals transition from queued → active → done/failed/cancelled. A higher priority pauses an active goal and clears its route and any plant channel. Resuming replans from Brim’s actual position; a plant restarts at zero and a hold retains elapsed ticks. At most one goal executes per tick. Terminal goals never re-enter the queue. An explicit deployment also fulfils an outstanding identical plan cue, so the play cannot accidentally spend another charge. `inspect().queue` includes the active goal. `reset(seed?)` creates a fresh controller, inventories, trace and ID sequence: access `round.brim` again after reset.

Movement uses the same A* and `moveAgent` as the scripts. The old public `round.assignRoute(id, goals: Vec[]): boolean` still works for other living agents; it returns false for Brim to prevent conflicting movement. A rejected goal yields to queued work. Two consecutive failures, 60 ticks of stationary navigation, or a failure with no remaining work schedule one scripted recovery and cancel pending stale goals. If recovery itself fails, Brim holds without retrying. Death and the 800-tick limit cancel outstanding work and close the queue.

`BrimEvent` is separate from render effects. **saw** records contact changes; **decided** records starts, interruptions, state changes, rejection and recovery; **did** records actions that actually happened, including plant start and finish. There is no synthetic dialogue. For rendering, use effects from `step()`, `round.snapshot(designer?, alpha?)`, `round.smokesLeft` and `round.mollyLeft`. The buy classifier returns a play ID or null. The conversation export includes prompts, chip selections and confirmations.

## Repeatable development demos

Run `npm run dev` and open the links below. The console API is available only on a development page with `agentLab` set. Each snippet resets the round before issuing commands, so time spent opening DevTools does not matter. The page’s existing Pause button freezes the HUD for inspection; the sandbox scrubber is unchanged.

**A — utility and movement:** Open [practice](http://127.0.0.1:5184/?agentLab=practice&seed=2026), then paste:

```js
brim.reset();
brim.addGoal({type:'smoke', target:'heaven'});
brim.addGoal({type:'move', target:'triple'});
```

The HUD changes from three dots to two. After landing, `brim.inspect().heavenBlocked` is true on the Heaven-to-Default sightline; it becomes false on expiry. Watch Brim round cover and stop at Triple. Inspect `brim.events()` for deployment and arrival. To interrupt en route, use `brim.addGoal({type:'hold',target:'truck'}, 'tactical')`.

**B — planting:** On the same practice page:

```js
brim.reset();
brim.addGoal({type:'plant', target:'default'});
```

Brim starts alone at his normal Short spawn, with the spike. The main map draws the progress ring, then the planted spike at (565,373); the HUD goes Carried → Planting → Planted. `brim.inspect().self.hasSpike` becomes false. This uses the normal movement, geometry, controller, spike, HUD and clock.

**C — adaptation:** Open [live seed 2026](http://127.0.0.1:5184/?agentLab=live&seed=2026). Run `brim.reset()`, wait two seconds, then `console.table(brim.events())`. Look for Omen at Cubby, the decision to hold, the pause, loss of contact and the resumed move. Reset again for the same ordered prefix. Later the trace records Brim covering Sova instead of planting. Designer view does not affect the decisions.

**Backend readiness:** The local API and Vite proxy both return HTTP 200 with `{"status":"ok"}` from the standard `npm run dev` pair on ports 3001 and 5184. Port 5173 is deliberately avoided because another demo-laptop project uses it. If the stage says unavailable, check `/api/health` on **both** ports of the running pair.
