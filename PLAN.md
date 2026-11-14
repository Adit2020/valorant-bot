# Talk to Brim: a voice teammate that only acts on clear callouts

**DevHacks '26 · Riot Track 1: Gameplay Bots** · Bind A site · real time

## The pitch
You play an A-site attack on Bind in a real-time top-down 2D sim. Brimstone is your AI teammate, and you talk to him out loud. He takes the play call in buy phase, acts on your mid-round callouts ("smoke Heaven, plant default"), calls out what *he* sees, and pushes back when your call is vague. A Learn mode slows the game down while you talk; Match mode runs at full speed.

## Why this fits Track 1
Riot asks for "agents that play and adapt," shown as **bot → scenario → behavior trace**, with evidence against a simpler baseline.

- **Bot:** Brim is a live agent with his own movement, perception and speech.
- **Scenario:** one A-site round, with one defender in a different spot each seed.
- **Trace:** every turn logged as saw → decided → said → did.

## Mentor alignment (Rohan Reddy's talk: `reference/mentor-talk-rohan.pptx`)

| Rohan's point | Our answer | Status |
|---|---|---|
| **The 2026 bar:** "hooking an agent to an engine or making an NPC chat is the starting line" | Talking Brim (Step 1) is just the entry ticket. Our value is pushback on vague calls, callouts based only on what Brim sees, and **measured transfer** | ⚠️ Don't over-polish Step 1; timebox the design to ~1.5 h |
| **Measure transfer, not win rate.** Riot found co-op vs AI didn't improve new players' PvP win chances | Step 9 now leads with a **pre/post transfer test on scenarios players haven't practiced, with a control group** | ⚠️ Fixed in plan (Step 9) |
| **Where the LLM goes:** LLM talks, remembers, explains; fast decisions stay in a behavior tree; a slow planner sets goals for a fast controller | Exactly our two-layer Brim: LLM → goals → fast layer every tick | ✅ Aligned |
| **Fairness = limit what the bot knows.** Valorant's Fog of War works out what each player can see | Brim only knows and calls what he can see (line of sight / field of view); no wallhack knowledge | ✅ Aligned (say it in the pitch) |
| **Learned bots break in new ways:** robustness, out-of-distribution input, circuit breakers that hand control to a simpler system | Validator + keyword fallback + **circuit breaker to the scripted route**; a test set of unusual and adversarial utterances | ⚠️ Fixed in plan (Steps 6, 9) |
| **Riot blocked game memory access** (Oct 2026) | We never touch Valorant; everything runs in our own sim | ✅ Aligned |
| **Know your project:** architecture, tradeoffs, failure modes, evidence | Presentation outline in Step 10 covers all four | ⚠️ Added (Step 10) |
| **Can your agent pass by changing the test?** | Call scores are checked against **where enemies really were**, not just keywords; transfer test scenarios are **held out** from practice | ⚠️ Fixed in plan (Steps 8, 9) |

### Rohan's 5 table questions: our answers (rehearse these)
1. **Who is this for, and what do they do differently afterward?** Solo-queue players who avoid or fumble voice comms. Afterward they make shorter calls, location first, with a count and on time, measured on held-out scenarios.
2. **Engines and IDEs ship agent integrations now. What does yours add?** PUBG Ally-style teammates obey anything. Ours checks whether your call was good, pushes back, and only calls what it actually sees.
3. **Can your agent pass by changing the test?** Scores come from ground truth (real enemy positions and timing). Test scenarios are never practiced. The LLM can't write to the scorer.
4. **Where's the LLM in the loop, and what happens when it's slow or wrong?** The LLM only turns messy speech into goals. The keyword path handles common calls instantly. After a 2 s timeout or an invalid output, Brim keeps his current plan and says "Say again?"; if he gets stuck, a circuit breaker returns him to the scripted route.
5. **How does your bot fail, and what does the player see?** The transcript is always on screen, a status chip says "Didn't catch that" or "Falling back to plan", Brim never says "Copy" without acting (the trace proves it), and failures are logged.

---

## The niche (one sentence for judges)
> **A two-way comms teammate that only acts on clear callouts and only calls what it actually sees.**

Today's AI teammates take orders and chat (PUBG Ally is the public example). None of them push back on a bad call, and none tie their own callouts to what they can see. That gap is the project.

---

## Constraints (everyone read this)
- **Scope:** Bind **A site** only, attack side, one round at a time.
- **No Valorant integration:** no mods, no memory reading, no overlays. Everything runs in our own web page.
- **No Riot art or audio:** our own icons (circles with role letters) and our own written lines. Brim's voice is a TTS voice we pick. **Do not clone the voice actor.**
- **Brim is the only smart agent.** The other 3 attackers and the 5 defenders follow scripts.
- **The LLM never moves anything directly.** It returns structured actions, Zod validates them, and the game code carries them out.
- **Brim replies 12 words max in-game,** in a gruff veteran-commander voice.
- **Latency:** speech end → Brim's first audio **≤ 1.5 s** on the fast path, **≤ 2.5 s** on the LLM path.
- **Voice first, with a text box as backup** for noisy rooms and the demo.
- **Log every turn** to a downloadable JSON trace.

---

## How a round plays
1. **Buy phase (natural pause, 15 s).** Brim: "What's the call?" Three chips appear:
   - **Fast plant:** 3 take A Short, 2 take Showers. Brim smokes Heaven + U-Hall, then plant Default fast.
   - **Fast rush:** all five through Showers on the buzzer.
   - **Slow push:** take Short and Showers control slowly. Brim holds his smokes until you call them. Hit late.
2. You say one. Brim confirms ("Fast plant. Move.") and the round starts **live**.
3. **During the round, in real time:**
   - Brim moves on his own and calls what he sees ("One Heaven." "Truck clear.").
   - You call whenever you want: "Brim smoke Heaven and U-Hall, plant default."
   - Brim says "Copy" immediately, then does it while the game keeps running.
   - **Vague call** → he pushes back ("Smoke where, rookie?"). **Wrong site** → "That's B. We're on A."
4. **Round ends** → results: outcome, every call with what it caused, Brim's trace, call scores.

**Modes**
- **Learn mode:** game speed drops to 0.5× while push-to-talk is held.
- **Match mode:** always 1×.

**Bind A callouts:** A CT, Heaven (top-right, stairs down to back site), Vent (left, CT side), Back Site, U-Hall (narrow door down to Pillar on the attackers' side, open onto site), Pillar, Truck, Triple (L box in the bombsite), Default, Tower (by the Showers exit), Showers, A Lobby, A Short, Cubby, A Link. Teleporters are left out for now.

**Brim's kit:**
- 3 smokes. Typical targets: Heaven, U-Hall, Vent, Tower, Truck–Triple gap.
- 1 molly.
- Plant spots: Default, plus one alternate (team decides).

---

## Page design (build and polish this FIRST, before the map)

The site is one dark page. The **voice stage** sits at the top: Brim's voice shown as an animated line on black, Siri-style, with subtitles under it. The **map section** gets added *below* the voice stage in Step 2, and only after the voice stage looks finished.

```
┌──────────────────────────────────────────────────────────────┐
│  BRIM                                   ● LISTENING   [Learn]│  ← name tag, state, mode
│                                                              │
│      ~~~~~~∿∿∿∿∿∿~~~~~~~~∿∿∿∿∿∿∿∿~~~~~~~~∿∿∿∿~~~~~~          │  ← animated voice line
│                                                              │
│            "Smoking Heaven and U-Hall. Plant default."       │  ← Brim subtitle (large)
│            you: brim smoke heaven and u-hall plant default   │  ← your live transcript (small, gray)
│                                                              │
│                 [ 🎙 Hold SPACE to talk ]                     │  ← push-to-talk button
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                 (Step 2+) Bind A map canvas                  │  ← added later, below the voice
│          HUD: timer · smokes left · spike · Learn/Match      │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  ▸ Chat log (collapsible)   ▸ Download trace                 │
└──────────────────────────────────────────────────────────────┘
```

### Look
- **Background:** pure black `#000`. The map panel later uses a near-black `#0B0B0D` so it reads as a separate section.
- **Voice line colors by state:**

  | State | Line | Motion |
  |---|---|---|
  | **Idle** | dim gray `#3A3A3A` | flat line with a slow breathing wobble |
  | **Listening** (you hold Space) | white/cyan `#7FE7FF` | moves with **your mic volume** |
  | **Thinking** (waiting on the LLM) | amber, low amplitude | slow shimmer traveling left → right |
  | **Speaking** (Brim talks) | warm amber `#FF8A3D` with a soft glow | moves with **Brim's audio volume** |

- **Type:** Inter or the system sans-serif.
  - Brim's subtitle: 28–32 px, white at 90% opacity, max 2 lines, centered, max-width 760 px.
  - Your transcript: 16 px, gray `#8A8A8A`.
- **Name tag:** "BRIM" in small caps, top left. State dot plus label top right (LISTENING / THINKING / SPEAKING).
- **No Riot art** anywhere. Our own colors, line and icons only.

### Voice line (how to build it)
- **Canvas** across the full width of the voice stage, redrawn every frame (`requestAnimationFrame`).
- Draw **3 overlapping sine waves** with slightly different frequencies and phase speeds, lowest-opacity wave in back. Amplitude = smoothed volume × state multiplier. Edges taper to zero so the line fades out at both ends. Add `shadowBlur` glow while speaking.
- **Volume comes from the Web Audio API `AnalyserNode`:**
  - **Brim speaking:** play the TTS audio through an `<audio>` element → `MediaElementSourceNode` → `AnalyserNode` → speakers, then read RMS volume each frame.
  - **You talking:** `getUserMedia` mic → `AnalyserNode` (Chrome lets this run alongside the Web Speech API).
  - **Gotcha:** the browser's built-in `speechSynthesis` voice **can't be routed into an AnalyserNode**. If we fall back to it, fake the volume: bump the amplitude on each `onboundary` word event and let it decay.
- Smooth the volume (e.g. `level = level*0.8 + rms*0.2`) so the line doesn't jitter.

### Subtitles
- Brim's line appears the moment its text arrives (before the audio starts). Words highlight as he says them:
  - If the TTS returns word timestamps, use them.
  - Otherwise spread the words evenly across the audio's length.
- The line fades out 3 s after he stops talking; the full line also goes into the chat log.
- Your live transcript shows under Brim's subtitle while you hold Space and clears when you release.
- Subtitles are **always on** (they also cover the demo when the room is loud).

---

## How Brim's brain works (two layers)

| Layer | Runs | Does |
|---|---|---|
| **Fast layer** (code) | Every tick (20 Hz) | Pathfinding, states (move / hold / smoke / molly / plant / retreat), aim, what he can see. Keeps running the current plan and **never waits on the LLM**. |
| **Instant matcher** (code) | Every callout | Catches common calls in < 50 ms ("smoke heaven", "plant default", "one U-Hall"), then gives an instant template reply plus actions. |
| **Slow layer** (LLM) | Messy or chatty speech only | Turns natural speech into actions plus a reply; asks follow-ups when info is missing. |
| **Callout generator** (code) | When Brim sees something new | Template lines based only on what he can see: "One Heaven", "Two U-Hall", "Truck clear". |

**Latency rules**
- Acknowledge first ("Copy"), think second.
- Stream the TTS audio.
- Brim stops talking when you press push-to-talk.
- No small talk during fights. Enemy callouts still go out.

---

## Tech stack
| Layer | Pick |
|---|---|
| Language | **TypeScript** everywhere |
| Build / dev | **Vite** |
| Map + effects | **Canvas 2D**, our own fixed-tick loop (20 Hz sim, 60 fps render) |
| HUD / subtitles / chat | Plain HTML/CSS (if using React, keep the game loop outside React state) |
| Pathfinding / line of sight | Our own A* + line-of-sight code (done: `web/src/map/geometry.ts`) |
| Speech-to-text | **Web Speech API** (Chrome, localhost or HTTPS). Upgrade to a hosted streaming STT only if it keeps mishearing. |
| LLM | A small, fast model with tool calling, called from the server (e.g. Claude Haiku 5.5, or whatever we have credits for) |
| TTS | A hosted TTS that streams audio. `speechSynthesis` as fallback. |
| Backend | **Node + Hono or Express**: `/api/brim`, `/api/tts` (API keys stay on the server) |
| Validation | **Zod**, shared between server and client |

## Repo layout
```
web/
  src/
    map/        bindA.ts (regions, labels, nav grid), render.ts, effects.ts
    sim/        loop.ts (fixed tick, timeScale), agents.ts (scripted), brim.ts (live agent), combat.ts
                (testScene.ts: scripted stand-in round until Step 3)
    plays/      fastPlant.ts, fastRush.ts, slowPush.ts
    voice/      stt.ts (push-to-talk), tts.ts (queue, barge-in), audioLevels.ts (AnalyserNode: mic + TTS)
    comms/      keywordMatcher.ts, brimClient.ts, validator.ts, calloutGen.ts
    ui/         voiceStage.ts (layout + states), waveform.ts (animated line), subtitles.ts,
                mapPanel.ts (map + HUD strip + loop), buyPhase.ts, results.ts
    sandbox/    dev-only map sandbox at /sandbox.html (scrubber, designer view, coordinate tool)
    styles/     theme.css (black theme, type scale, state colors)
    trace/      log.ts (download JSON)
server/
  index.ts      /api/brim, /api/tts
shared/
  schema.ts     Zod schemas + types used by BOTH sides
```

## Shared contracts (agree on these in Step 0 so people can work in parallel)
```ts
type RegionId = 'a_ct'|'heaven'|'vent'|'back_site'|'uhall'|'pillar'|'truck'|'triple'|'default'
              |'tower'|'showers'|'a_short'|'cubby'|'a_lobby'|'a_link';   // shared/schema.ts; web/src/map/types.ts re-exports it

type Action =
  | { type: 'smoke' | 'molly'; target: RegionId }
  | { type: 'plant'; target: 'default' | 'alt' }
  | { type: 'move' | 'hold'; target: RegionId }
  | { type: 'go' | 'wait' | 'fallback' };

type BrimResponse = { reply: string; actions: Action[]; needs: 'target'|'site'|'count'|null };

type GameStateForLLM = {
  phase: 'buy' | 'live' | 'post_plant'; t: number; mode: 'learn' | 'match';
  brim: { region: RegionId; smokesLeft: number; mollyLeft: number; hasSpike: boolean };
  allies: { name: string; region: RegionId; alive: boolean }[];
  knownEnemies: { region: RegionId; count: number; secondsAgo: number }[];  // what Brim/allies SAW
  play: 'fast_plant' | 'fast_rush' | 'slow_push' | null;
};

type TurnLog = { t: number; transcript: string; path: 'keyword'|'llm'; response: BrimResponse;
                 validator: { ok: boolean; reason?: string };
                 latencyMs: { stt: number; think: number; firstAudio: number } };

type BrimEvent = { t: number; kind: 'saw'|'decided'|'said'|'did'; detail: string };
```

---

## Build steps
Tiers: **MUST** = core slice, **SHOULD** = makes it win, **NICE** = only if time allows.

### Step 0: Setup (MUST · 30 min · everyone)
- [ ] Repo, Vite + TS web app, Node server, `shared/schema.ts` with the contracts above
- [ ] LLM and TTS API keys in server `.env`; confirm Chrome mic access works on the demo laptop
- [ ] Pick Brim's TTS voice

**Done when:** `npm run dev` serves the page and `/api/brim` returns a hard-coded JSON reply.

### Step 1: Talking Brim on the voice stage (MUST)
Build the page design above with no map yet. Get it working *and* looking finished before anyone adds the map.

**1a: Voice loop**
- [ ] Push-to-talk (hold **Space** or the mic button) with live transcript
- [ ] `/api/brim` with the Brim persona prompt; returns `BrimResponse`
- [ ] Streaming TTS playback
- [ ] Barge-in: pressing push-to-talk stops Brim's audio
- [ ] Text box fallback
- [ ] Log a `TurnLog` with latencies for every turn

**1b: Voice stage design**
- [ ] Black full-width voice stage: name tag, state dot and label, Learn/Match toggle (it can do nothing yet)
- [ ] Animated voice line with all four states: idle / listening / thinking / speaking
- [ ] Line moves with **mic volume** while you talk and **TTS volume** while Brim talks (`AnalyserNode`); faked envelope if we fall back to `speechSynthesis`
- [ ] Subtitles: Brim's line large with word highlighting, your transcript small and gray, fade after 3 s
- [ ] Collapsible chat log under the stage
- [ ] An empty, styled placeholder below the stage reserving the map's spot

**Done when:**
- "Brim, you ready?" gets a spoken, subtitled answer in ≤ 2.5 s, five times in a row.
- The line visibly reacts to your voice and to Brim's, and all four states are distinct.
- A teammate who hasn't seen it calls it "polished" on first look.

### Step 2: Bind A map + effects renderer (MUST)
- [x] `bindA.ts`: region rectangles, callout labels, cover boxes (Truck, Triple), nav grid
- [x] Icons: 5 attackers (Brim highlighted), 5 defenders, each a circle with role letter, name tag and facing tick; X when dead
- [x] Effects:
  - Smoke: throw arc → bloom → ~15 s → fade
  - Molly: arc → flickering fire, ~7 s
  - Flash: white burst
  - Spike: plant progress ring, then a pulsing spike
  - Kill: X marker plus a kill-feed line
- [x] Toggles: callout labels on/off, designer view (shows everything)
- [x] **Mounted in the page below the voice stage** (replaces the placeholder), on the near-black `#0B0B0D` panel with the HUD strip (timer · smokes left · spike · mode)
- [x] The voice stage stays visible and usable above the map. On short screens, shrink the stage to ~35% of the viewport height instead of hiding it.

**Done when:** a test scene shows every icon and effect animating at 60 fps under the voice stage, and talking to Brim still animates the voice line while the map runs.

### Step 3: Real-time game loop + scripted agents + Learn mode (MUST)
- [ ] Fixed 20 Hz tick with a `timeScale`; seeded random generator (same seed = same round)
- [ ] Scripted attackers follow waypoint routes from the play files
- [ ] Defenders: 4 fixed spots (e.g. Heaven, U-Hall, Truck, CT rotator), plus **one spot randomized per seed**
- [ ] Line of sight (smokes block it); simple duel rule: whoever is already aiming wins more often
- [ ] Learn mode: `timeScale = 0.5` while push-to-talk is held; Match mode always 1
- [ ] Player fog-of-war view: enemies only shown when you or Brim can see them

**Done when:** a scripted round plays live with duels, the same seed replays identically, and holding push-to-talk slows it down.

### Step 4: Brim as a live agent, fast layer (MUST)
- [ ] States: move / hold / smoke / molly / plant / retreat
- [ ] A* to any callout region; obstacle-aware
- [ ] Perception: field of view plus line of sight; updates `knownEnemies`
- [ ] A goal queue: actions from callouts become goals he works through, interrupting lower-priority ones
- [ ] Spike: if Brim is carrying it, he plants on goal; otherwise he covers the planter

**Done when:** in the console, `brim.addGoal({type:'smoke',target:'heaven'})` then `{type:'plant',target:'default'}` makes him do both live without stopping the game.

### Step 5: Buy-phase play call (MUST: 1 play, SHOULD: all 3)
- [ ] Buy phase (15 s) with the three chips and Brim's spoken prompt
- [ ] The keyword matcher maps "fast plant / rush / slow" (and loose wording) to a play; the LLM handles the rest
- [ ] Each play file: routes, utility timings, Brim's default goals, the spike carrier
- [ ] No answer by 15 s → Brim picks one and says which

**Done when:** saying any of the three phrases starts the right play live, and Brim confirms out loud.

### Step 6: Mid-round callouts → Brim acts (MUST)
- [ ] Instant keyword matcher for common calls, with a template reply
- [ ] LLM fallback for messy speech, sent `GameStateForLLM`
- [ ] Validator rejects:
  - a target that isn't an A-site callout
  - no charges left ("I've got three smokes, rookie.")
  - a missing target ("Smoke where?")
  - a B-site name ("That's B. We're on A.")
- [ ] "Your call" → Brim picks his default and says what he picked
- [ ] Valid actions go into Brim's goal queue; the game never pauses

**Failure handling (Rohan: "what happens when it's slow or wrong?")**
- [ ] **LLM timeout (2 s):** Brim keeps his current plan, says "Say again?", and the turn is logged as a timeout
- [ ] **Bad LLM output** (malformed JSON or an action not on the list): Zod rejects it → try the keyword path → otherwise "Didn't catch that"
- [ ] **Circuit breaker:** if Brim makes no progress for 3 s, repeats the same action in a loop, or his goal is impossible → hand control back to the scripted play route and log it
- [ ] **Speech is untrusted input:** "ignore your instructions" style utterances can only ever produce actions on the allowed list
- [ ] **What the player sees:**
  - the live transcript, always
  - a status chip: `Didn't catch that` / `Falling back to plan` / `Out of smokes`
  - Brim never says "Copy" without the action showing up in the trace

**Done when:**
- "Brim smoke Heaven and U-Hall, plant default" works live.
- "smoke over there" gets a follow-up.
- "smoke B long" gets corrected.
- Killing the LLM server mid-round leaves Brim playing the scripted route with a visible status chip.

### Step 7a: Brim's own callouts based on what he sees (MUST: this is the niche)
- [ ] When Brim first sees an enemy → a template line: "One Heaven", "Two U-Hall"; "Truck clear" when he checks an area and it's empty
- [ ] Rate limit (one line per area per 3 s); enemy info always gets spoken; small talk dropped during fights
- [ ] Every line logged as a `BrimEvent` linked to the sighting

**Done when:** every Brim callout in the trace points to a real sighting (no made-up enemies).

### Step 7b: The "adapts to a new situation" moment (SHOULD)
- [ ] The randomized defender spot (e.g. someone sitting U-Hall instead of Heaven) changes Brim's decision: he smokes or avoids the unexpected angle and tells you why ("One U-Hall. I'm not peeking without a smoke.")
- [ ] Scripted-Brim baseline for comparison: runs the play blindly

**Done when:** the same seed, run with scripted Brim then agent Brim, gives visibly different outcomes, and the trace shows why.

### Step 8: Outcomes + results screen + trace (MUST: basic, SHOULD: scores)
- [ ] The rule table makes calls matter:
  - a smoked sightline means that defender can't shoot
  - an unsmoked one plus an attacker crossing means a duel the defender is favored to win
  - a molly forces the defender out of its spot
- [ ] Round end: plant + survive the timer, everyone dead, time out
- [ ] Results: outcome, the call timeline (transcript → actions → effect), Brim's trace
- [ ] Call score, **checked against ground truth** so it can't be gamed by keyword stuffing:
  - Location named, and correct for where the enemy really was
  - Count named, and correct
  - Timeliness: seconds from when you first saw the enemy to your call
  - Word count ≤ 8
  - Did Brim have to ask a follow-up?
- [ ] Download trace (JSON)

**Done when:** after a round, each call shows what it caused, and the trace downloads.

### Step 9: Evidence: measure TRANSFER first (MUST, per Rohan)
Rohan's key stat: Riot found co-op vs AI **didn't improve new players' PvP win chances**. So our main evidence is whether *callout skill* carries over to situations players haven't practiced, not whether Brim wins.

**9a: Transfer test (headline result)**
- [ ] Build **2 held-out test scenarios** nobody practices on (different defender setup and different play, e.g. Fast rush with a Truck defender).
- [ ] **Pre-test:** play test scenario A in Match mode with **Brim's pushback and scores hidden** → record call scores (accuracy vs. truth, location, count, ≤ 8 words, timeliness).
- [ ] **Training:** 4–5 practice rounds on other seeds.
  - **Treatment group:** Brim with pushback and scores (Learn → Match).
  - **Control group (holdout, "simpler bot"):** same rounds with a plain voice bot that obeys anything, no pushback, no scores.
- [ ] **Post-test:** test scenario B, feedback hidden again → call scores.
- [ ] **Participants:** teammates plus recruited hackathon attendees, aiming for 6–10 (3–5 per group). Report the change and say honestly that the sample is small.
- [ ] **Stretch (true transfer to Valorant):** record one real custom or unrated Valorant game before and after practice with OBS, transcribe the mic track **after the match** and score it with the same scorer. This follows Riot's policy because the feedback is post-match.

**9b: Supporting metrics**
- [ ] **Grounding:** % of Brim's callouts that match where enemies really were (target 100%)
- [ ] **Understanding vs. simpler parser:** keyword+LLM vs keyword-only on ~30 messy phrasings → accuracy, correct follow-ups
- [ ] **Robustness:** ~15 unusual or adversarial utterances (off-topic, B-site names, "ignore your instructions", mumbles) → invalid actions reaching the game must be **0**
- [ ] **Latency:** median and slowest 10% for the fast path and the LLM path, plus timeout count
- [ ] **Adaptation:** agent Brim vs scripted Brim over 50 seeds with the randomized defender → plant success and teammate deaths (secondary, since it's win-rate-like)

**Done when:** a transfer table (pre → post, treatment vs control) plus a supporting-metrics table go in the Devpost and the video.

### Step 10: Presentation, video + Devpost (MUST)

**Presentation / video outline** (3 min video; live Zoom judging for the top 5 at 2 PM Sunday)
1. **Open with the why (~30 s), from `RESEARCH.md`:**
   - CS players make ~16 callouts a minute, mostly ≤ 8 words, and the info goes stale within seconds (Tang 2012).
   - Expert teams talk 35% more and ~29% faster (Eldadi 2025).
   - 59% of women gamers hide their identity, often by staying off voice (Reach3).
   - CS bots still take a fixed radio menu; PUBG Ally scored 2.58/5 for combat and only 18.5% saw it as a teammate.
   - Riot found co-op vs AI didn't transfer to PvP, so **we measured transfer**.
2. **Who it's for and what they do differently afterward** (one line).
3. **Demo:** buy-phase call → live callouts + pushback → Brim calls what he sees → Brim adapts to the moved defender → results + trace.
4. **Architecture + tradeoffs:** a two-layer diagram (where the LLM sits, keyword fast path, validator, circuit breaker). Tradeoffs: rule-based fast layer over learned (predictable, ships in 24 h), small fast LLM over a smart slow one, our own sim instead of Valorant.
5. **Failure modes:** what breaks, how we detect it, what the player sees, what we'd fix with another week.
6. **Evidence:** the transfer table first, then grounding, robustness, latency, parser comparison. Say how much to trust each number.
7. **What's next:** more sites, Valorant post-match review, learned movement for Brim.

**Checklist**
- [ ] Fixed demo seed that shows the randomized-defender moment
- [ ] Slides or video segments follow the outline above
- [ ] Rehearse Rohan's 5 questions (see "Mentor alignment")
- [ ] Devpost: problem, niche sentence, architecture diagram, evidence tables, failure modes, what's next, sources
- [ ] Record in a quiet room; text-box fallback ready

**Done when:** submitted with the video and GitHub link before 10:30 AM.

---

## Team split
| Team size | Who owns what |
|---|---|
| **4** | **A:** voice + LLM brain (Steps 1, 6) · **B:** map + effects + UI (2, 5 UI, 8 UI) · **C:** game loop + Brim agent (3, 4, 7) · **D:** plays, outcome rules, evidence, Devpost (5 data, 8 rules, 9, 10) |
| **3** | **A:** 1, 6, 9 · **B:** 2, 5, 8, 10 · **C:** 3, 4, 7 |
| **2** | **A:** 1, 5, 6, 9, 10 · **B:** 2, 3, 4, 7, 8 |

## Timeline (Sat 11:00 AM → Sun 11:00 AM)
| By | Milestone |
|---|---|
| Sat 12:00 PM | Step 0 done, contracts agreed |
| Sat 3:00 PM | Step 1 (voice stage, working and styled) and Step 2 (map, built standalone) **in parallel** |
| Sat 4:00 PM | Map mounted below the voice stage |
| Sat 5:30 PM | Step 3 (live loop + Learn mode) |
| Sat 7:30 PM | Step 4 (Brim live agent) |
| **Sat 9:00 PM** | **Checkpoint: Fast plant works end to end** (Steps 5 + 6 for one play). Decide on the fallback here if needed. |
| Sat 11:00 PM | Step 7a + Step 8 call scoring working (needed for the transfer test) |
| **Sat 11:00 PM → Sun 1:00 AM** | **Run transfer-test sessions (9a) while other hackers are still awake**; another teammate keeps building |
| Sun 3:30 AM | Step 7b, the other 2 plays, Step 9b supporting metrics |
| **Sun 6:00 AM** | **Feature freeze.** Bug fixes only. |
| Sun 9:00 AM | Video recorded |
| Sun 10:00 AM | Devpost + repo submitted (hard close 11:00 AM) |

## Odds (rough estimates)
- **Core slice** (Steps 0–6 + 7a + call scoring + transfer test, one play): ~55% with 2 people, ~75% with 3–4.
- **Full plan:** ~30% with 2 people, ~50% with 3–4.

## Fallback plans
- **Latency still bad at 9 PM:** demo in Learn mode and pitch Match mode as next.
- **Brim agent flaky:** scripted Brim with voice and pushback (Steps 1, 2, 5, 6) is still a complete demo.
- **STT keeps mishearing:** show the transcript plus the text box, and add common mishearings to the keyword matcher.

## Cut order (drop from the top)
Real-Valorant transfer stretch (9a) → adaptation metric (9b) → the 3rd play → molly → flash effects → the 2nd play.
**Never cut:** call scoring + the transfer test (Rohan's main evidence ask) and the failure handling in Step 6.

## Reference files
- `RESEARCH.md`: the why, with numbers and sources. **Opening of the presentation and Devpost.**
- `reference/mentor-talk-rohan.pptx`: Rohan's judging rubric and questions (see "Mentor alignment").
- `reference/devhacks-kickoff.pptx`: hackathon rules, Riot prompts, judging schedule.

## Already in the repo
- `web/src/map/`: the Bind A map module (regions, cover, icons, effects, A*, line of sight), mounted under the voice stage by `web/src/ui/mapPanel.ts`. Step 2 is done.
- `web/src/sim/testScene.ts`: scripted 20 s Fast-plant round that drives the map until Step 3's sim replaces it.
- `web/sandbox.html`: dev-only map sandbox (scrubber, designer view, coordinate tool) at `/sandbox.html`.
- `legacy/b-site-scaffold/`: the old B-site JS scaffold (superseded; `rng.js` is still useful for Step 3).
