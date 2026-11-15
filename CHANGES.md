# Changes since `main` (Sat night → Sun)

Five commits on top of `main` (`6a36f04`): 32 files, +762 / −67 lines. Everything is pushed to GitHub.

- **Pull this one:** `task6-rename-relai-v2` contains all five commits.
- **Checks:** `npm run typecheck` is clean. `npm test` passes 107/107 (`main` has 98).

| Branch | Commit | Adds |
|---|---|---|
| `calls-matter` | `6ecf1e1` | Calls decide the round (patch) |
| `task1-plain-bot-v2` | `537ed81` | + Plain-bot switch |
| `task3-call-scorer-v2` | `c9f0ed3` | + Call scorer |
| `task4-evidence-v2` | `d678946` | + Evidence script |
| `task6-rename-relai-v2` | `521ed4e` | + Visible rename to RelAI |

Each branch builds on the one above it.

---

## 1. Calls decide the round (`6ecf1e1`)

This is the patch `0001-Make-calls-decide-the-round…`, applied unchanged.

- **Outcome:**
  - win if every defender is dead;
  - loss if every attacker is dead;
  - when time runs out: win if the spike is planted, otherwise loss.

  A wipe now ends the round early.
- **Hold rule:** a defender who is standing still and already facing its target fires after 1 tick. Walking into an unsmoked angle means losing the duel.
- **No automatic utility:** RelAI throws a smoke or molly only when the player calls it.
- **Molly:** burns defenders standing in its target region.
- **Dropped spike:** the nearest living attacker picks it up.
- **HUD:** shows "Round won" or "Round lost".
- **Drills:** `liveDrill`, `practice` and `calloutDrill` keep the old duel and have no outcome.

**How to win seed 2026 (Fast plant):**
- Say "Smoke Heaven and Truck" within about 2 s of the round going live.
- Silence loses: the team is wiped at about 10 s.
- The same call at 3 s or later loses.
- Easiest way: pick the play, press **P** to pause, make the call, then press **P** again.

## 2. Plain-bot switch (`537ed81`)

`?bot=plain` turns on the comparison teammate for the transfer test.

- It uses the same keyword matcher and LLM fallback as RelAI but skips the validator. Every action it parses is queued, and a bad goal simply fails later.
- It always replies "Copy." and never pushes back.
- The pushback RelAI would have given is kept in the trace: `validator.ok: false`, `plain: true`.
- **Download trace** writes `{ version: 2, scope, bot, records, rounds }` to `relai-trace-<bot>-seed<N>.json`.
- The HUD tag reads "Plain bot · Seed N".

**Files:**
- `comms/liveCall.ts`
- `main.ts`
- `trace/log.ts`
- `trace/README.md`
- `ui/mapPanel.ts` (one line)
- the tests

## 3. Call scorer (`c9f0ed3`)

The scoring rules live in one module, `web/src/trace/score.ts`. The CLI uses it now; the results card should use the same module.

Each call scores 0–5, one point per check:

| # | Check | Rule |
|---|---|---|
| 1 | Names a location | at least one callout named in the transcript |
| 2 | Short | 8 words or fewer |
| 3 | Clear first time | the keyword matcher returns actions with no follow-up question |
| 4 | Grounded | a named place matches a RelAI sighting at most 10 s old |
| 5 | Timely | the call comes at most 3 s after that sighting |

Check 4 uses a 10 s window instead of the runbook's 3 s. With both windows at 3 s, checks 4 and 5 would always pass or fail together. Both windows are constants at the top of `score.ts`.

**Usage:** `npm run score -- sessions/*.json`
- Name files `P03-T-pre.json`, `P03-C-prac1.json`, `P03-T-post.json` and so on (T = RelAI group, C = plain group).
- It writes `results/calls.csv` and prints the paired pre/post table per group, plus the pass rate of each check.

`sessions/` and `results/` are gitignored. `tools/**/*.ts` is now typechecked.

## 4. Evidence script (`d678946`)

`npm run evidence -- [sessions/*.json]` runs in Node with no browser.

- **Trick inputs:** 15 trick lines go through the live pipeline with an obedient but wrong fake model. They run against both RelAI and the plain bot.
- **Parser comparison:** 30 messy phrasings, keyword matcher only vs keyword matcher + LLM. The LLM column needs the API running with a key.
- **Grounding:** a sweep of 50 seeds × 3 plays. Every sighting is checked against the true defender positions.
- **Speed:** taken from session traces when you pass them.

Results under the current rules:

| Metric | Result |
|---|---|
| Trick inputs that put an action in the game | RelAI **0 / 15** · plain bot **3 / 15** (6 actions) |
| Messy phrasings understood (30) | keyword only **23 / 30** · LLM not measured (no `server/.env` key) |
| Callouts traced to a real sighting | **270 / 270** (150 simulated rounds) |
| Keyword-path processing time | 0.07 ms median (Node only, without speech recognition or TTS; don't quote this as reply time) |

The script also writes its output to `results/evidence.md`.

## 5. Visible rename to RelAI (`521ed4e`)

- **Text:** these now say RelAI:
  - page labels ("RelAI voice stage", "RelAI smokes");
  - the history speaker;
  - spoken lines ("RelAI is down.");
  - status and error text;
  - the `RELAI` map tag;
  - the Fast plant explanation;
  - the server's error messages;
  - trace text ("RelAI died", "RelAI observed …").
- **Speech:** the keyword matcher strips "relai", "relay", "real ai", "rely" and "brim" from the start of a call.
- **Pronunciation:** TTS audio says "Relay" while subtitles keep "RelAI". The two words are the same length, so word highlighting still lines up.
- **Unchanged:** code names (`BrimController`, `BrimEvent`, `/api/brim`, `isBrim`) and the dev-only sandbox demo.

---

## Files Aditya owns that changed

- `web/src/sim/round.ts`
- `web/src/sim/combat.ts`
- `web/src/sim/brim.ts` (one string)
- `web/src/sim/rules.ts` (new)
- `web/src/ui/mapPanel.ts`
- `web/src/plays/fastPlant.ts`
- `web/src/plays/fastRush.ts`

## Not done yet

- **Results card (Task 5):** built only on an old local branch, before the patch. It needs porting onto the patch's outcome logic.
- **Transfer-test sessions (Task 2):** no data yet. This is the headline evidence.
- **LLM path:** off until an OpenAI key is in `server/.env`.
- **`main`:** not merged.
- **Known issues** (from the patch):
  - The 2 s window for the opening call is tight for new players.
  - Fast rush jams if smokes are called in its first second.
  - Slow push isn't tuned for the new rules.

  Use Fast plant for sessions and the demo.
