# ATL: Zone Wars

A browser-based 3D arena shooter in the spirit of classic Call of Duty multiplayer, set in a stylized Atlanta. Two fictional crews, the **Zone 6 Reapers** (Eastside) and the **Westside Kings** (Bankhead), fight over four neighborhood maps against bots.

No build step and no assets to download. Everything (textures, models, sound effects, the trap beat on the menu) is generated in code. Three.js is vendored in `lib/`.

## Play

ES modules need to be served over HTTP, so run any static server from the repo root:

```bash
python3 -m http.server 8000
# or: npx serve .
```

Then open http://localhost:8000 in a desktop browser (Chrome, Edge or Firefox). You need a mouse and keyboard.

## Features

- **CoD-style feel**: hitmarkers (white, yellow for headshots, red for kills), aim down sights, sprint, crouch, jump, recoil, weapon bob and sway, a death cam, damage-direction indicators, a grenade warning, health regen and a red-edge damage vignette.
- **Create-a-Class**: 5 custom class slots (saved in your browser) with a primary, a secondary and 3 perk slots.
  - Primaries: Choppa (AR), The Stick (burst rifle), Draco (SMG), Mac-11 (SMG), Pump (shotgun), Longshot (scoped sniper), Big Drum (LMG)
  - Secondaries: Glizzy, Switch Glizzy (full-auto), Desert Eagle, .38 Snub
  - Perks: Lightweight / Scavenger · Stopping Power / Fast Hands · Ghost / Hardline
  - You can switch class from the death screen between lives.
- **Killstreaks**: UAV (3), Airstrike (5) and Ghetto Bird attack chopper (7). Hardline cuts one kill off each.
- **Medals and score popups**: First Blood, Double/Triple Kill, Headshot, Payback, Longshot, Buzzkill, Afterlife and more.
- **5 game modes**
  - *Turf War*: Team Deathmatch, first crew to 75 kills
  - *Every Man 4 Himself*: Free-for-All, first to 30
  - *Block Control*: Domination with flags A/B/C, first to 250
  - *Chain Snatch*: Kill Confirmed. Kills drop gold chains. Grab enemy chains to score and your crew's to deny.
  - *Gun Game*: 11 weapons ending on the knife. If you get knifed, you drop a level.
- **4 maps**
  - *Bankhead Strip*: night, neon storefronts (wing spot, barbershop, check cashing), main drag plus back alleys
  - *Zone 6 Courtyard*: dusk, apartment blocks around a basketball court, with breezeways
  - *Five Points Station*: underground MARTA station, a stalled train, platforms and concourses
  - *Westside Chop Shop*: overcast junkyard, crushed-car stacks, containers and a garage you can fight through
- **Bots** with A* pathfinding, reaction time, aim error that tightens while tracking, strafing, grenades, objective play and killstreaks. There are 3 difficulty levels and 4–16 players per match.
- **Progression**: you earn XP and rank up from *Lookout* to *Legend of the A*.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Left / Right click | Shoot / Aim |
| Shift | Sprint |
| Space | Jump (or respawn when dead) |
| C / Ctrl | Crouch (toggle / hold) |
| R | Reload |
| 1, 2, Q, wheel | Switch weapon |
| G | Frag grenade |
| V / F | Quick melee |
| 3 / 4 / 5 | UAV / Airstrike / Ghetto Bird |
| Tab | Scoreboard |
| Esc | Pause |

## Code layout

| File | What it does |
| --- | --- |
| `src/main.js` | Renderer, menus, profile saved to localStorage, match lifecycle |
| `src/game.js` | Match logic: spawns, hit detection, damage and kills, modes, killstreaks, grenades |
| `src/player.js` | Player input, first-person camera, viewmodel animation |
| `src/bot.js` | Bot AI: perception, aiming, navigation, objectives |
| `src/soldier.js` | Shared movement physics and weapon state |
| `src/world.js` | Builds maps from data: meshes, colliders, nav grid, lighting, static mesh merging |
| `src/maps.js` | Map layouts |
| `src/config.js` | Weapons, perks, streaks, modes, difficulty, names |
| `src/hud.js` | HUD, radar, killfeed, scoreboard, death screen |
| `src/models.js` | Low-poly characters and guns |
| `src/textures.js` | Procedural canvas textures (brick, graffiti, signs, skyline…) |
| `src/audio.js` | Synthesized SFX and the menu beat |
| `src/effects.js` | Tracers, muzzle flashes, impacts, explosions |

All crews, characters and businesses are fictional.
