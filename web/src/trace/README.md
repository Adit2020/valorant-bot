# Conversation and round trace

Download trace exports version 2, with conversation records plus a rounds array. Every live command carries its roundId, simulation time, keyword/LLM path, interpretation when available, validator result, accepted goal IDs, decision time and measured processing cost. The surrounding record contains the original transcript, actual spoken line, input and audio source, interruptions and nullable STT, think and first-audio times. A shared TurnLog is attached only when its required timings are available.

Each rounds entry includes seed, roundId, end (restart or current) and time-ordered BrimEvents. Join command goal IDs to controller events within the same round. A did event records a real simulation action. Deployment precedes smoke landing by 12 ticks. A said event links a turn ID and its line to the first observed playback-start callback. Audio failure before playback leaves the subtitle and no said event.

Simulation timestamps use round seconds. Conversation timestamps use seconds since page initialization. Durations use client performance.now() in milliseconds. Restart archives the departing round; reload clears in-memory history.
