# Research: why a callout-trained AI teammate?

Numbers for the Devpost, the pitch and the video. Every number has a source at the bottom; facts are paraphrased.
**Accuracy note:** a few numbers come from secondary summaries and are marked *(secondary)*. Say "studies show" only for the primary ones.

---

## 1. Headline numbers (for a slide or the first 20 seconds of the video)

| # | Stat | Source |
|---|---|---|
| 1 | Counter-Strike tournament players made **16.2 callouts per minute**, most of them **8 words or fewer** | Tang et al., CSCW 2012 |
| 2 | **69.5%** of callouts about yourself or the enemy include a **location**, and most callout info goes stale **within a few seconds** | Tang et al., CSCW 2012 |
| 3 | Expert CS:GO teams made **34.63% more** between-round statements and talked **29.39% faster** (words per second) than non-expert teams | Eldadi & Tenenbaum, 2025 |
| 4 | **76%** of adult online gamers (18–45) were harassed in 2023; **48%** of women gamers were harassed because of their gender | ADL, 2024 |
| 5 | **59%** of women gamers hide their gender, including by **not using voice chat** | Reach3 / Lenovo, 2021 |
| 6 | Counter-Strike bots still take orders from a **fixed radio menu** that goes to **all bots at once**, and by default bots can randomly **ignore** those orders | Valve dev wiki; CS command docs |
| 7 | The most advanced public AI teammate (PUBG Ally) scored **2.58/5 for combat**; only **18.5%** of players saw it as a real teammate | Krafton technical report, 2026 |
| 8 | Valorant: **35M+ monthly players** (Riot, Oct 2024), yet **no bots in PC custom games** | Riot via press; RankedKings |

---

## 2. Why communication decides rounds in tactical FPS

**Callouts are short, place-based, and expire fast** (Tang et al., CSCW 2012: 49 tournament players, ~6 hours of coded audio)
- Callouts per minute: **Halo 3 25.5, Counter-Strike 16.2, Team Fortress 2 10.5**.
- **69.5%** of callouts about yourself or the enemy include a location; **43.5%** of directive callouts do.
- Most callouts are **8 words or fewer**.
- Most callout info is out of date **within a few seconds**. Under pressure, players say they fall back to vaguer calls.

**Experts talk more, faster, and more usefully**
- Between rounds (Eldadi & Tenenbaum 2025; ~1,052 statements, 8 CS:GO matches): experts made **34.63% more statements** at a **29.39% higher word rate**.
- During live play (Eldadi, Fitoussi & Tenenbaum, *J. Sport & Exercise Psychology* 2025):
  - Experts mostly used **factual and action statements**, talked faster, and **spread the talking across all five players**.
  - Experts moved from **uncertainty to acknowledgement** ("where?" → "copy").
  - Non-experts drifted into **off-task and emotional** talk.
  - *(secondary)* Experts spoke **15,727** of the 22,490 words recorded during play, vs 6,763 for non-experts.
- Takeaway: concise, factual, acknowledged communication builds a **shared picture of the round** and speeds up decisions.

**Callouts are how a team "sees" together**
- In first-person shooters each player sees only their own slice of the map; callouts merge those views into one awareness for the team (Rusk, Taylor & Ståhl).
- Callout skill is **learned through practice** (what to share, when, how short); researchers call it "callout competence" (Tampere University).

**Bad comms cost performance**
- A controlled experiment with **716 League of Legends players**: a toxic teammate **significantly worsened team and individual performance** (Monge & O'Brien, *Media Psychology*).
- Pings (non-verbal comms) relate to team performance in competitive games (Leavitt, Keegan & Clark, "Ping to Win?", CHI 2016).

---

## 3. Why players don't practice comms (who this helps)

- **76%** of adult online gamers (18–45) and **75%** of teens (10–17) experienced harassment in online games in 2023 (ADL).
- **48%** of women gamers were harassed because of their gender (ADL 2023).
- In ADL's 2025 test sessions, **57%** of Valorant and Counter-Strike 2 sessions using a "Proud2bJewish" username drew identity-based harassment.
- After harassment, **23%** of players avoid certain games, **19%** quit certain games, and **27%** change how they play (ADL 2019).
- **59%** of women gamers mask their gender, including by **refraining from voice chat**; **77%** have faced gender-specific discrimination (Reach3/Lenovo, 900 women, US/China/Germany, 2021).
- A UK survey (Bryter) found **23%** of women gamers avoid voice chat entirely.
- Researchers note that racial and gender minorities often stay off game voice chat for fear of harassment, even though callouts are expected (Rusk et al.).
- Riot itself began recording Valorant voice comms after reports. Studio head Anna Donlon called voice comms a major problem in competitive gaming culture.

**Takeaway:** the people who most need comms practice are often the ones locked out of practicing it with strangers. A bot teammate gives them a judgment-free place to practice.

---

## 4. How bots in rival games handle communication today

**Counter-Strike (CS:GO / CS2): the classic bot**
- Bots take orders from a fixed radio menu: Follow Me, Go go go, Hold This Position, Need Backup, Roger, and so on.
- "Hold position" applies to **every bot on the server**; you can't order one specific bot.
- `bot_allow_rogues` is **on by default**: bots randomly "go rogue" and **ignore radio commands**.
- Bot radio messages use **place names** written into the map's navigation mesh. Location-tagged comms is a 20-year-old idea; open-ended voice input is what's new.
- CS:GO bots still **don't move like humans**. A learned model was rated **16–59% more human-like** than commercially available bots and expert-scripted bots (MLMove study).
- A neural agent trained on 5.5M frames of human play only **matched the medium-difficulty built-in bot** (Pearce & Zhu, NeurIPS workshop 2021).

**Valorant**
- **No AI bots in PC custom games**; console players get a separate **Bot Training Match** mode.
- Riot and modl.ai published imitation-learning bots for a Valorant-like **2v2** game (Lyra:Ascent), about **human-like movement and combat, not communication**.

**PUBG Ally (Krafton + NVIDIA, 2026): the most advanced shipped AI teammate**
- Built from **38,956** sessions with **1,046** paid players.
- Scores: combat **2.58/5**. Situational judgment, response speed and command execution all scored below **3/5**.
- Players saw Ally as a **tool (50%)**, a **companion (31.5%)**, or a **teammate (18.5%)**. Net recommendation: **+25.1**.
- Complaints:
  - Ally said **"Okay" without doing the action**.
  - It kept talking during late-game fights when players needed to hear footsteps.
- Latency for one voice exchange: **~1.6 s on-device vs ~3.4 s in the cloud**. Krafton found a timely answer mattered more than a slightly more accurate one.
- Cost per match with a frontier cloud LLM: **$5.14–$7.10**, which Krafton called impractical. A small open model cost **$0.02–$0.06**.

**Others**
- **Ubisoft Teammates** (2025): a voice-commanded squad prototype built on Gemini, in **closed playtest with a few hundred players**.
- **Tencent F.A.C.U.L.** (Arena Breakout: Infinite): the paper notes that FPS companions have usually been limited to hotkeys and command wheels ("attack / defend / retreat").

**The gap, and our niche:** every system above *takes* orders. None of them checks whether the order was a **good callout**, pushes back on vague calls, or ties its own callouts to what it can actually see.

---

## 5. What human–AI teaming research says (design lessons)

- **Predictable beats clever.** In a blind Hanabi study, players preferred a rule-based AI teammate over a learned one on nearly every subjective measure, with **no difference in score** (Siu et al., NeurIPS 2021).
- **Skilled isn't the same as communicative.** DeepMind's Quake III agents were rated more collaborative than human teammates, but they had **no communication** with the team (DeepMind; Smithsonian).

---

## 6. How each finding shapes our design

| Finding | Design choice |
|---|---|
| Most callouts are ≤ 8 words; info goes stale in seconds | Calls are scored for brevity; RelAI replies in ≤ 12 words; **real-time** play with latency targets |
| 69.5% of useful callouts include a location | RelAI's validator **requires a location** and pushes back without one ("Smoke where?") |
| Experts move from uncertainty to acknowledgement | RelAI **acknowledges every call** ("Copy") and asks for missing info, modeling the expert pattern |
| Experts stay factual and on-task | RelAI's own callouts are short, factual and based on what it sees; no small talk during fights |
| 59% of women hide their identity; many avoid voice chat | A **judgment-free practice partner** before playing ranked with strangers |
| CS bots: a fixed menu to all bots; bots may ignore orders | Open-ended voice input, aimed at one teammate, and every accepted call is **carried out and logged** |
| PUBG Ally said "Okay" without acting; talked during fights | The trace confirms every acknowledged action actually ran; chatter is muted in fights |
| PUBG Ally: speed beats accuracy; cloud LLM costs ~$5–7/match | Instant keyword path for common calls; the LLM only for messy speech; small, fast model |
| Players prefer predictable teammates | RelAI's fast layer is rule-based and readable; the behavior trace explains each decision |

---

## 7. Caveats to say out loud if judges ask

- Tang et al. is from 2012 (Halo 3, TF2, CS 1.6/Source era) and used a small sample of 49 players. It's still the most-cited source for callout rates.
- The Eldadi studies cover 8 CS:GO matches each; they show differences between experts and non-experts, not cause and effect.
- The ADL and Reach3 numbers come from surveys; the ADL 2025 study tested specific usernames in sessions.
- PUBG Ally's survey respondents chose to play the beta; Krafton didn't report absolute respondent counts.
- Valorant player numbers: Riot's last official figure is from Oct 2024; 2026 numbers are third-party estimates (roughly 15–34M monthly).

---

## Sources
- Tang et al., "Verbal Coordination in First Person Shooter Games," CSCW 2012. https://faculty.cc.gatech.edu/~keith/pubs/cscw2012-fps.pdf
- Eldadi & Tenenbaum, "Between-Rounds Verbal Communication in Expert and Nonexpert Esports Team Players," *Sport, Exercise, and Performance Psychology* (2025). https://cris.iucc.ac.il/en/publications/between-rounds-verbal-communication-in-expert-and-nonexpert-espor/
- Eldadi, Fitoussi & Tenenbaum, "Verbal Communication, Coordinated Effort, and Performance in Esports Teams," *J. Sport & Exercise Psychology* 47(5), 2025. https://ersearch2.cvtisr.sk/vufind/EdsRecord/edb,188264676
- *(secondary summary used for word counts and context)* VoxBooster, "Esports team voice comms callout statistics 2026." https://voxbooster.com/blog/esports-team-voice-comms-callout-statistics-2026/
- Rusk, Taylor & Ståhl, "The Social Accomplishment of Seeing," *Simulation & Gaming*. https://trepo.tuni.fi/bitstream/10024/152600/1/The_Social_Accomplishment_of_Seeing.pdf
- Tampere University, callout competence study. https://www.tuni.fi/en/tau/news-and-events/gamers-documented-their-gameplay-research-competitive-gaming-learning-takes
- Monge & O'Brien, "Effects of individual toxic behavior on team performance in League of Legends," *Media Psychology*. https://www.x-mol.com/paper/1347652010145374208
- Leavitt, Keegan & Clark, "Ping to Win?," CHI 2016. https://researchr.org/publication/LeavittKC16
- ADL, Hate and Harassment in Online Gaming 2023 (press release, Feb 2024). https://www.adl.org/resources/press-release/three-quarters-young-people-experienced-harassment-online-gaming-2023-new
- ADL, identity-based harassment test sessions (Jan 2025). https://www.adl.org/resources/press-release/hate-and-harassment-present-almost-half-online-multiplayer-gaming-sessions
- ADL, "Free to Play?" (2019). https://www.adl.org/resources/report/free-play-hate-harassment-and-positive-social-experiences-online-games
- Reach3 / Lenovo women gamers survey (2021), via We Got This Covered and PinkNews. https://wegotthiscovered.com/gaming/59-women-hide-gender-playing-games-online-survey-finds/ · https://thepinknews.com/2021/05/21/women-in-gaming-study-video-games-women-gamers/
- Bryter survey, via Mail & Guardian. https://www.pressreader.com/south-africa/mail-guardian/20210409/281513638964956
- PC Gamer, Riot recording Valorant voice chat. https://www.pcgamer.com/au/riot-will-start-recording-valorant-voice-chat-to-root-out-toxic-players
- Valve Developer Community, CS:GO radio console commands. https://developer.valvesoftware.com/wiki/Radio_console_commands_(Counter_Strike:_Global_Offensive)
- Alphr, CS:GO bot commands (holdpos applies to all bots). https://www.alphr.com/add-bots-csgo/
- TotalCSGO, `bot_allow_rogues`. https://totalcsgo.com/commands/botallowrogues
- Valve Developer Community, Nav Mesh Editing (place names in radio messages). https://developer.valvesoftware.com/wiki/Nav_edit
- Durst et al., "Learning to Move Like Professional Counter-Strike Players" (MLMove). https://arxiv.org/html/2408.13934v1
- Pearce & Zhu, "Counter-Strike Deathmatch with Large-Scale Behavioural Cloning." https://neurips.cc/virtual/2021/48824
- RankedKings, Valorant bot matches (PC vs console). https://rankedkings.pages.dev/blog/botting-up-your-guide-to-starting-a-bot-match-in-valorant-2025
- Justesen et al. (modl.ai + Riot), "Human-like Bots for Tactical Shooters Using Compute-Efficient Sensors." https://arxiv.org/html/2501.00078v1
- Inven Global, Krafton's PUBG Ally report scorecard. https://www.invenglobal.com/articles/26592/built-a-teammate-got-a-chat-partner-kraftons-first-scorecard-for-pubg-ally
- Krafton, "PUBG Ally: A Conversational Embodied Agent as an AI Teammate" (arXiv 2609.29837). https://www.alphaxiv.org/abs/2609.29837
- Ground News / Engadget coverage, Ubisoft Teammates. https://ground.news/article/ubisoft-boss-believes-generative-ai-is-as-big-a-revolution-for-games-as-the-shift-to-3d-as-tech-is-embraced-company-wide
- Wei et al. (Tencent), F.A.C.U.L., AAAI. https://ojs.aaai.org/index.php/AAAI/article/download/38842/42804
- Siu et al., "Evaluation of Human-AI Teams for Learned and Rule-Based Agents in Hanabi," NeurIPS 2021. https://deepai.org/publication/evaluation-of-human-ai-teams-for-learned-and-rule-based-agents-in-hanabi
- DeepMind, "Capture the Flag." https://deepmind.com/blog/capture-the-flag-science
- Smithsonian, on FTW agents lacking communication. https://www.smithsonianmag.com/innovation/the-stout-scarab-the-future-that-never-was-180972322/
- Valorant player counts: Turbosmurfs (Riot's Oct 2024 figure + 2026 estimates). https://turbosmurfs.gg/article/valorant-player-count-and-statistics
