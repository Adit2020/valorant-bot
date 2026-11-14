// Three attack plays on Bind B, plus defender setups.
// Route waypoint fields:
//   to: [x, y]            where to go
//   speed: 'run' | 'walk' (default run). Walking is quiet; running can be heard.
//   hold: 'exec' | 'exec+N' | 'end' | number   wait here until the execute (plus N s), forever, or an absolute time
//   watch: [x, y]         where to aim while holding
// Util `when`: number (absolute seconds) or 'exec+N' / 'exec-N' (relative to the execute).

export const ATTACKERS = [
  { agent: 'Raze', role: 'D', tag: 'RAZ' },
  { agent: 'Skye', role: 'I', tag: 'SKY' },
  { agent: 'Brimstone', role: 'C', tag: 'BRM' },
  { agent: 'Sova', role: 'I', tag: 'SOV' },
  { agent: 'Cypher', role: 'S', tag: 'CYP' },
];

export const DEFENDERS = [
  { agent: 'Killjoy', role: 'S', tag: 'KJ' },
  { agent: 'Viper', role: 'C', tag: 'VIP' },
  { agent: 'Chamber', role: 'S', tag: 'CHA' },
  { agent: 'Omen', role: 'C', tag: 'OMN' },
  { agent: 'Jett', role: 'D', tag: 'JET' },
];

// Utility each attacker brings. Charges not used by the play can be called for mid-round ("smoke elbow").
export const KITS = {
  Raze: { molly: 1 },
  Skye: { flash: 2 },
  Brimstone: { smoke: 3, molly: 1 },
  Sova: { recon: 2 },
  Cypher: { smoke: 1 },
};

export const PLAYS = [
  {
    id: 'split',
    name: 'Split B',
    style: 'Balanced · timed',
    blurb: 'Three take Long, two take Hookah. Everyone hits at the same time off a Sova dart, Brim smokes on Elbow + Hall and a Skye flash over Garden.',
    youAre: 'Raze, entry from Long',
    executeAt: 12,
    spikeCarrier: 'Sova',
    roster: {
      Raze: { player: true, start: [115, 575], route: [
        { to: [115, 310], speed: 'walk' },
        { to: [115, 268], hold: 'exec', watch: [160, 185] },
        { to: [200, 212] }, { to: [330, 212] },
        { to: [372, 322], hold: 'end', watch: [600, 400] },
      ], post: [360, 168], postWatch: [375, 112] },
      Skye: { start: [92, 588], route: [
        { to: [95, 330], speed: 'walk' },
        { to: [95, 290], hold: 'exec', watch: [150, 185] },
        { to: [170, 205] }, { to: [300, 180] },
        { to: [420, 180], hold: 'end', watch: [375, 112] },
      ], post: [440, 176], postWatch: [640, 210] },
      Brimstone: { start: [142, 596], route: [
        { to: [142, 340], speed: 'walk' },
        { to: [142, 305], hold: 'exec', watch: [185, 185] },
        { to: [232, 202] },
        { to: [345, 362], hold: 'end', watch: [590, 395] },
      ], post: [348, 360], postWatch: [455, 312] },
      Sova: { start: [680, 600], route: [
        { to: [680, 522], speed: 'walk' },
        { to: [648, 450], speed: 'walk', hold: 'exec', watch: [588, 395] },
        { to: [588, 406] }, { to: [540, 360] },
        { to: [520, 318], hold: 'end', watch: [690, 210] },
      ], post: [540, 365], postWatch: [455, 312] },
      Cypher: { start: [700, 592], route: [
        { to: [700, 522], speed: 'walk' },
        { to: [690, 456], speed: 'walk', hold: 'exec', watch: [680, 560] },
        { to: [600, 410] }, { to: [600, 350] },
        { to: [600, 300], hold: 'end', watch: [690, 210] },
      ], post: [600, 300], postWatch: [690, 210] },
    },
    util: [
      { by: 'Sova', type: 'recon', at: [470, 250], when: 7 },
      { by: 'Brimstone', type: 'smoke', at: [375, 116], when: 'exec-1.2' },
      { by: 'Brimstone', type: 'smoke', at: [632, 210], when: 'exec-1.2' },
      { by: 'Skye', type: 'flash', at: [300, 205], when: 'exec-0.4' },
    ],
  },
  {
    id: 'rush',
    name: 'Long Rush',
    style: 'Fast · aggressive',
    blurb: 'All five run Long on the buzzer. Smokes cut Elbow and Hall, a Skye flash and Brim molly clear Garden and Corner Box. Nobody checks Hookah, so someone has to call it.',
    youAre: 'Raze, first through Garden',
    executeAt: 2,
    spikeCarrier: 'Sova',
    roster: {
      Raze: { player: true, start: [115, 560], route: [
        { to: [115, 560], hold: 'exec' },
        { to: [115, 300] }, { to: [150, 205] }, { to: [320, 212] },
        { to: [380, 322], hold: 'end', watch: [600, 405] },
      ], post: [360, 170], postWatch: [375, 112] },
      Skye: { start: [92, 575], route: [
        { to: [92, 575], hold: 'exec' },
        { to: [98, 300] }, { to: [168, 192] }, { to: [320, 178] },
        { to: [468, 178], hold: 'end', watch: [375, 112] },
      ], post: [460, 176], postWatch: [640, 210] },
      Brimstone: { start: [138, 582], route: [
        { to: [138, 582], hold: 'exec' },
        { to: [136, 320] }, { to: [200, 214] },
        { to: [345, 365], hold: 'end', watch: [590, 398] },
      ], post: [348, 362], postWatch: [590, 398] },
      Sova: { start: [150, 625], route: [
        { to: [150, 625], hold: 'exec' },
        { to: [140, 335] }, { to: [232, 206] },
        { to: [520, 318], hold: 'end', watch: [690, 210] },
      ], post: [535, 318], postWatch: [690, 210] },
      Cypher: { start: [205, 640], route: [
        { to: [205, 640], hold: 'exec' },
        { to: [150, 345] }, { to: [242, 214] },
        { to: [565, 180], hold: 'end', watch: [690, 210] },
      ], post: [570, 180], postWatch: [690, 210] },
    },
    util: [
      { by: 'Brimstone', type: 'smoke', at: [375, 116], when: 'exec+1.0' },
      { by: 'Brimstone', type: 'smoke', at: [632, 210], when: 'exec+1.0' },
      { by: 'Skye', type: 'flash', at: [330, 228], when: 'exec+2.9' },
      { by: 'Brimstone', type: 'molly', at: [365, 240], when: 'exec+3.1' },
    ],
  },
  {
    id: 'slow',
    name: 'Slow Hookah',
    style: 'Slow · info-driven',
    blurb: 'Four walk into Hookah and wait while you lurk Long alone. The team goes when YOU call it ("go"), or at 0:26. Then you push Garden to cut off Elbow rotations.',
    youAre: 'Cypher, lurking Long',
    executeAt: 26,
    waitForCall: true,
    spikeCarrier: 'Sova',
    roster: {
      Cypher: { player: true, start: [115, 575], route: [
        { to: [115, 335], speed: 'walk' },
        { to: [115, 275], speed: 'walk', hold: 'exec+1.5', watch: [160, 185] },
        { to: [200, 210] }, { to: [252, 128] },
        { to: [330, 74], hold: 'end', watch: [600, 70] },
      ], post: [330, 74], postWatch: [600, 70] },
      Raze: { start: [680, 600], route: [
        { to: [680, 525], speed: 'walk' },
        { to: [640, 456], speed: 'walk', hold: 'exec', watch: [588, 396] },
        { to: [588, 406] }, { to: [520, 345] },
        { to: [420, 240], hold: 'end', watch: [300, 200] },
      ], post: [420, 236], postWatch: [375, 112] },
      Skye: { start: [700, 600], route: [
        { to: [700, 525], speed: 'walk' },
        { to: [682, 446], speed: 'walk', hold: 'exec', watch: [590, 396] },
        { to: [602, 406] }, { to: [602, 340] },
        { to: [600, 240], hold: 'end', watch: [690, 210] },
      ], post: [600, 240], postWatch: [690, 210] },
      Brimstone: { start: [660, 615], route: [
        { to: [665, 532], speed: 'walk' },
        { to: [700, 472], speed: 'walk', hold: 'exec', watch: [680, 560] },
        { to: [612, 410] },
        { to: [560, 362], hold: 'end', watch: [690, 210] },
      ], post: [560, 362], postWatch: [455, 312] },
      Sova: { start: [690, 625], route: [
        { to: [690, 542], speed: 'walk' },
        { to: [660, 478], speed: 'walk', hold: 'exec', watch: [590, 396] },
        { to: [586, 406] }, { to: [500, 350] },
        { to: [470, 322], hold: 'end', watch: [375, 112] },
      ], post: [500, 352], postWatch: [455, 312] },
    },
    util: [
      { by: 'Sova', type: 'recon', at: [520, 300], when: 10 },
      { by: 'Sova', type: 'recon', at: [450, 185], when: 'exec-3' },
      { by: 'Brimstone', type: 'smoke', at: [632, 210], when: 'exec-1.0' },
      { by: 'Brimstone', type: 'smoke', at: [375, 116], when: 'exec-1.0' },
      { by: 'Brimstone', type: 'molly', at: [640, 318], when: 'exec-0.6' },
      { by: 'Skye', type: 'flash', at: [540, 352], when: 'exec-0.4' },
    ],
  },
];

export const PLAY_BY_ID = Object.fromEntries(PLAYS.map((p) => [p.id, p]));

// Defender setups. behavior: anchor (hold), aggro (hold, then fall back once 2+ attackers are seen),
// rotator (arrives from CT after contact). watch = angle they hold. fallback = where they retreat to.
export const SETUPS = [
  {
    id: 'standard',
    name: 'Standard (Long aggro, Hookah, Backsite)',
    roster: [
      { agent: 'Jett', behavior: 'aggro', pos: [115, 172], watch: [115, 480], fallback: [300, 72], fallbackWatch: [250, 140], molly: true },
      { agent: 'Viper', behavior: 'anchor', pos: [606, 446], watch: [680, 560], fallback: [560, 300], fallbackWatch: [590, 400] },
      { agent: 'Killjoy', behavior: 'anchor', pos: [580, 160], watch: [300, 205], fallback: [700, 210], fallbackWatch: [450, 300] },
      { agent: 'Omen', behavior: 'rotator', entry: [950, 150], pos: [690, 212], watch: [450, 300], delay: 7 },
      { agent: 'Chamber', behavior: 'rotator', entry: [950, 120], pos: [376, 116], watch: [300, 220], delay: 9 },
    ],
  },
  {
    id: 'retake',
    name: 'Retake (Elbow, Hall, Cubby)',
    roster: [
      { agent: 'Chamber', behavior: 'anchor', pos: [300, 72], watch: [250, 145], fallback: [600, 70], fallbackWatch: [380, 120] },
      { agent: 'Killjoy', behavior: 'anchor', pos: [700, 210], watch: [450, 300], fallback: [880, 150], fallbackWatch: [700, 210] },
      { agent: 'Viper', behavior: 'anchor', pos: [642, 318], watch: [320, 260], fallback: [700, 215], fallbackWatch: [450, 300] },
      { agent: 'Omen', behavior: 'rotator', entry: [950, 150], pos: [640, 214], watch: [450, 300], delay: 5 },
      { agent: 'Jett', behavior: 'rotator', entry: [950, 110], pos: [378, 116], watch: [300, 220], delay: 6 },
    ],
  },
  {
    id: 'stack',
    name: 'Stack B (four on site)',
    roster: [
      { agent: 'Jett', behavior: 'aggro', pos: [265, 166], watch: [115, 420], fallback: [420, 165], fallbackWatch: [300, 210], molly: true },
      { agent: 'Killjoy', behavior: 'anchor', pos: [370, 238], watch: [250, 200], fallback: [580, 160], fallbackWatch: [300, 205] },
      { agent: 'Viper', behavior: 'anchor', pos: [606, 446], watch: [680, 560], fallback: [560, 300], fallbackWatch: [590, 400] },
      { agent: 'Chamber', behavior: 'anchor', pos: [580, 160], watch: [590, 396], fallback: [700, 210], fallbackWatch: [450, 300] },
      { agent: 'Omen', behavior: 'rotator', entry: [950, 150], pos: [690, 212], watch: [450, 300], delay: 8 },
    ],
  },
];
