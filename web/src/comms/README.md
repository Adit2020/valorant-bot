# Mid-round voice commands

The live branch of ConversationDependencies.reply calls liveReply(round, roundId, mode, transcript, signal, record). The record callback attaches the mutable command trace to the originating conversation turn before any asynchronous work. Buy calls still use buyReply. Speech recognition submits once on finalization and release. Text goes through the same router.

matchKeyword resolves full callout names and aliases, shares a verb across joined targets and keeps action order. “Fall back to A Short” moves to Short. Bare “fallback” retreats to the play spawn. Hold watches from the current position. An invalid or underspecified clause rejects the entire local command. Direct smoke placements are limited to the map’s five overhead landing spots.

Unmatched calls POST a validated transcript and gameState(round, mode) to /api/brim. The server uses the configured Responses SDK, a strict vocabulary and a two-second maximum deadline. The browser also bounds the wait, checks the round’s controller identity and cancellation signal, and revalidates against current state. Model target mentions must match the transcript’s named targets in order. Unnamed or inferred destinations need clarification. Current knownEnemies comes only from round.observations('brim'). SecondsAgo is zero because these are current observations. If Brim’s position has no mapped region, the client asks for a repeat.

validateActions checks the entire batch, including queued utility, matching play cues, terrain, projected movement, molly line of sight, the living carrier and plant zone. It schedules each accepted action via round.brim.addGoal(action, 'command') in one synchronous turn. The controller charges utility on deployment, replans after interruptions, and checks the world again during execution. Covering Sova uses the existing plant goal. Sova keeps the spike and follows his own Default planting route.

“Your call” watches a currently observed contact, continues the highest-priority pending goal by ID, or holds and saves utility. Continuing an existing order does not enqueue a duplicate. The round trace records the reason.

## Automatic enemy callouts

After movement, damage and deaths on each live tick, Round feeds only `round.observations('brim')` to its round-local `round.callouts` generator. `regionAt(x, y)` assigns each contact a map name. A changed set of visible IDs creates a sighting. An unmapped point or an empty set produces no location claim. The map has point-to-point visibility, with no area inspection or coverage record, so clearance calls are deferred.

The generator retains at most one pending line per region. Loss of contact removes the line. A changed count or membership replaces it. Eligible lines go oldest first, with simultaneous sightings ordered by count (descending), then region. Scheduling and actual playback start each establish a 60-tick cooldown for that region. An unchanged group stays silent, including when an extra contact briefly appears and disappears before anyone hears about it. Continuous confirmation keeps a pending line current.

The map panel reserves one idle conversation slot with `Conversation.tryCallout(call, roundId, report)`. Listening, transcript finalization, command processing and acknowledgments all own the channel until they finish. Push-to-talk and typed commands interrupt automatic speech immediately. The generator produces only enemy reports during combat. A contact change during TTS preparation aborts the obsolete line. A line that already started can finish, subject to player interruption, death, round end, restart or a hidden tab. Mode changes preserve the current round and its simulation-time cooldowns.

Use `round.callouts.events(): BrimEvent[]` for detached sighting and speech evidence, `round.brim.events(): BrimEvent[]` for controller actions, and `mapPanel.trace(): RoundTrace[]` for the joined round history. The judge's join keys and callback semantics are in the [trace format](../trace/README.md).
