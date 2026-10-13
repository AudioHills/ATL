// Static game data: weapons, perks, killstreaks, modes, crews, names.

export const TEAMS = {
  A: { id: 'A', name: 'Zone 6 Reapers', short: 'Z6', color: '#ff8a1f', hex: 0xff8a1f },
  B: { id: 'B', name: 'Westside Kings', short: 'WSK', color: '#9b5cff', hex: 0x9b5cff },
};

// spread values are in degrees, ranges in meters, reload/adsTime in seconds
export const WEAPONS = {
  choppa: {
    name: 'Choppa', cls: 'Assault Rifle', slot: 'primary', model: 'ak',
    dmg: 34, minDmg: 25, head: 1.5, rpm: 600, auto: true, mag: 30, reserve: 150,
    reload: 2.4, hip: 4.2, ads: 0.55, recoil: 1.15, r1: 30, r2: 60, move: 0.93, adsTime: 0.24,
    zoom: 1.35, sound: { f: 900, d: 0.16, g: 1.0, thump: 90 },
    desc: 'Hits like a truck. Classic Westside heat.',
  },
  stick: {
    name: 'The Stick', cls: 'Burst Rifle', slot: 'primary', model: 'ar',
    dmg: 37, minDmg: 28, head: 1.6, rpm: 950, burst: 3, burstDelay: 0.22, mag: 30, reserve: 150,
    reload: 2.2, hip: 3.6, ads: 0.35, recoil: 0.9, r1: 35, r2: 70, move: 0.94, adsTime: 0.24,
    zoom: 1.45, sound: { f: 1300, d: 0.12, g: 0.9, thump: 110 },
    desc: 'Three-round burst. Reward the patient.',
  },
  draco: {
    name: 'Draco', cls: 'SMG', slot: 'primary', model: 'draco',
    dmg: 29, minDmg: 17, head: 1.4, rpm: 760, auto: true, mag: 30, reserve: 150,
    reload: 2.0, hip: 3.2, ads: 1.0, recoil: 1.45, r1: 12, r2: 32, move: 0.98, adsTime: 0.18,
    zoom: 1.25, sound: { f: 800, d: 0.14, g: 1.0, thump: 80 },
    desc: 'Short barrel, big attitude. Kicks hard.',
  },
  mac: {
    name: 'Mac-11', cls: 'SMG', slot: 'primary', model: 'mac',
    dmg: 21, minDmg: 13, head: 1.35, rpm: 1050, auto: true, mag: 32, reserve: 192,
    reload: 1.8, hip: 2.8, ads: 1.3, recoil: 0.75, r1: 9, r2: 24, move: 1.02, adsTime: 0.15,
    zoom: 1.2, sound: { f: 1600, d: 0.08, g: 0.7, thump: 140 },
    desc: 'Bullet hose. Melts anything up close.',
  },
  pump: {
    name: 'Pump', cls: 'Shotgun', slot: 'primary', model: 'pump',
    dmg: 19, minDmg: 4, head: 1.15, rpm: 72, auto: false, pellets: 9, mag: 6, reserve: 36,
    reload: 3.0, hip: 6.5, ads: 4.8, recoil: 4.5, r1: 6, r2: 18, move: 0.95, adsTime: 0.2,
    zoom: 1.15, sound: { f: 500, d: 0.32, g: 1.3, thump: 60 },
    desc: 'Hold the hallway. One pump, one problem solved.',
  },
  longshot: {
    name: 'Longshot', cls: 'Sniper', slot: 'primary', model: 'sniper',
    dmg: 110, minDmg: 95, head: 2.0, rpm: 46, auto: false, mag: 5, reserve: 30,
    reload: 3.1, hip: 9.0, ads: 0.0, recoil: 5.0, r1: 100, r2: 200, move: 0.88, adsTime: 0.38,
    zoom: 4.0, scope: true, sound: { f: 600, d: 0.45, g: 1.4, thump: 55 },
    desc: 'From the rooftop on Simpson Rd. One tap.',
  },
  bigdrum: {
    name: 'Big Drum', cls: 'LMG', slot: 'primary', model: 'lmg',
    dmg: 31, minDmg: 24, head: 1.4, rpm: 680, auto: true, mag: 80, reserve: 160,
    reload: 4.8, hip: 5.2, ads: 0.8, recoil: 1.0, r1: 30, r2: 60, move: 0.84, adsTime: 0.34,
    zoom: 1.35, sound: { f: 750, d: 0.18, g: 1.1, thump: 75 },
    desc: 'Eighty in the drum. Suppress the whole block.',
  },
  glizzy: {
    name: 'Glizzy', cls: 'Pistol', slot: 'secondary', model: 'pistol',
    dmg: 30, minDmg: 19, head: 1.5, rpm: 420, auto: false, mag: 15, reserve: 75,
    reload: 1.45, hip: 2.4, ads: 0.8, recoil: 1.2, r1: 12, r2: 28, move: 1.05, adsTime: 0.13,
    zoom: 1.15, sound: { f: 1400, d: 0.1, g: 0.8, thump: 130 },
    desc: 'Everyday carry. Reliable.',
  },
  switchy: {
    name: 'Switch Glizzy', cls: 'Auto Pistol', slot: 'secondary', model: 'pistol_ext',
    dmg: 20, minDmg: 12, head: 1.4, rpm: 1150, auto: true, mag: 31, reserve: 93,
    reload: 1.8, hip: 4.2, ads: 2.2, recoil: 1.3, r1: 8, r2: 20, move: 1.04, adsTime: 0.14,
    zoom: 1.15, sound: { f: 1500, d: 0.08, g: 0.7, thump: 140 },
    desc: 'Full auto with the extendo. Hard to hold.',
  },
  deagle: {
    name: 'Desert Eagle', cls: 'Hand Cannon', slot: 'secondary', model: 'deagle',
    dmg: 58, minDmg: 42, head: 1.6, rpm: 210, auto: false, mag: 7, reserve: 35,
    reload: 1.9, hip: 3.5, ads: 0.6, recoil: 3.2, r1: 18, r2: 40, move: 1.0, adsTime: 0.16,
    zoom: 1.2, sound: { f: 700, d: 0.25, g: 1.2, thump: 65 },
    desc: 'Big chrome. Bigger statement.',
  },
  snub: {
    name: '.38 Snub', cls: 'Revolver', slot: 'secondary', model: 'revolver',
    dmg: 49, minDmg: 34, head: 1.7, rpm: 170, auto: false, mag: 6, reserve: 36,
    reload: 2.4, hip: 3.0, ads: 0.7, recoil: 2.6, r1: 14, r2: 32, move: 1.03, adsTime: 0.14,
    zoom: 1.2, sound: { f: 850, d: 0.22, g: 1.1, thump: 70 },
    desc: 'Six shots. Old school.',
  },
  knife: {
    name: 'Knife', cls: 'Melee', slot: 'melee', model: 'knife',
    dmg: 150, minDmg: 150, head: 1, rpm: 90, auto: false, mag: 0, reserve: 0,
    reload: 0, hip: 0, ads: 0, recoil: 0, r1: 2.4, r2: 2.4, move: 1.1, adsTime: 0.1, zoom: 1,
    melee: true, sound: { f: 3000, d: 0.05, g: 0.3, thump: 0 }, desc: 'Gun Game finale.',
  },
};

export const PRIMARIES = ['choppa', 'stick', 'draco', 'mac', 'pump', 'longshot', 'bigdrum'];
export const SECONDARIES = ['glizzy', 'switchy', 'deagle', 'snub'];
export const GUN_LADDER = ['mac', 'draco', 'choppa', 'stick', 'bigdrum', 'pump', 'longshot', 'deagle', 'switchy', 'snub', 'knife'];

export const PERKS = [
  [
    { id: 'lightweight', name: 'Lightweight', desc: '+12% movement speed. Get to the corner first.' },
    { id: 'scavenger', name: 'Scavenger', desc: 'Kills refill your reserve ammo and grenades.' },
  ],
  [
    { id: 'stopping', name: 'Stopping Power', desc: '+20% bullet damage.' },
    { id: 'fasthands', name: 'Fast Hands', desc: 'Reload and aim 35% faster.' },
  ],
  [
    { id: 'ghost', name: 'Ghost', desc: 'Invisible to enemy UAV. Firing stays off their radar.' },
    { id: 'hardline', name: 'Hardline', desc: 'Killstreaks need one less kill.' },
  ],
];

export const STREAKS = [
  { id: 'uav', name: 'UAV', kills: 3, key: '3', desc: 'Shows enemies on the radar for 30s.' },
  { id: 'airstrike', name: 'Airstrike', kills: 5, key: '4', desc: 'Bombing run on enemy positions.' },
  { id: 'heli', name: 'Ghetto Bird', kills: 7, key: '5', desc: 'Attack chopper circles the block for 30s.' },
];

export const MODES = {
  tdm: { id: 'tdm', name: 'Turf War', sub: 'Team Deathmatch', teams: true, limit: 75, time: 600,
    desc: 'Two crews, one block. First to 75 kills runs the neighborhood.' },
  ffa: { id: 'ffa', name: 'Every Man 4 Himself', sub: 'Free-for-All', teams: false, limit: 30, time: 600,
    desc: 'No crew, no loyalty. First to 30 kills.' },
  dom: { id: 'dom', name: 'Block Control', sub: 'Domination', teams: true, limit: 250, time: 600,
    desc: 'Hold the corners A, B and C. Every second you hold one, your crew scores.' },
  kc: { id: 'kc', name: 'Chain Snatch', sub: 'Kill Confirmed', teams: true, limit: 40, time: 600,
    desc: 'Every body drops a chain. Snatch enemy chains to score, grab your crew\'s to deny.' },
  gun: { id: 'gun', name: 'Gun Game', sub: 'Arms Race', teams: false, limit: GUN_LADDER.length, time: 600,
    desc: 'Every kill upgrades your weapon. Get a knife kill at the end. Get knifed and you drop a level.' },
};

export const DIFFICULTY = {
  recruit: { name: 'Recruit', react: 0.85, aimErr: 5.5, aimLearn: 0.9, fireHold: 0.6, dmgTaken: 0.85 },
  regular: { name: 'Regular', react: 0.55, aimErr: 3.6, aimLearn: 1.4, fireHold: 0.85, dmgTaken: 1.0 },
  veteran: { name: 'Veteran', react: 0.28, aimErr: 1.8, aimLearn: 2.2, fireHold: 1.0, dmgTaken: 1.0 },
};

export const BOT_NAMES = [
  'Lil Peach', 'Big Bankhead', 'Zone6Zay', 'MARTA Mike', 'LemonPepperLou', 'Dirty Decatur',
  'Cascade Cee', 'Old4th Ollie', 'Ponce Pooh', 'EastPoint Earl', 'Lil Hotlanta', 'Southside Sly',
  'Grady Baby', 'Buckhead Bandit', 'Mechanicsville Mo', 'Vine City Vic', 'Kirkwood Kev',
  'Edgewood Eddy', 'Adamsville Ace', 'Thomasville Tay', 'Candler Rd Cam', 'Glenwood Gee',
  'Peoplestown Pat', 'Riverdale Ray', 'College Park Cj', 'Hapeville Hank', 'Lakewood Lex',
  'Simpson Rd Sim', 'Bowen Homes Bo', 'Perry Homes P', 'Cleveland Ave Cleo', 'Moreland Mook',
];

export const DEFAULT_CLASSES = [
  { name: 'Corner Boy', primary: 'choppa', secondary: 'glizzy', perks: ['lightweight', 'stopping', 'hardline'] },
  { name: 'Run & Gun', primary: 'mac', secondary: 'switchy', perks: ['lightweight', 'fasthands', 'ghost'] },
  { name: 'Rooftop', primary: 'longshot', secondary: 'deagle', perks: ['scavenger', 'stopping', 'ghost'] },
  { name: 'Hallway Hero', primary: 'pump', secondary: 'snub', perks: ['lightweight', 'fasthands', 'hardline'] },
  { name: 'Block Holder', primary: 'bigdrum', secondary: 'glizzy', perks: ['scavenger', 'stopping', 'hardline'] },
];

export const RANKS = [
  'Lookout', 'Runner', 'Corner Boy', 'Hustler', 'Shooter', 'Enforcer', 'Lieutenant',
  'Block Captain', 'Plug', 'Shot Caller', 'Kingpin', 'Legend of the A',
];
export const XP_PER_LEVEL = (lvl) => 1000 + lvl * 450;
