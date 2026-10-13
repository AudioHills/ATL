// Headless capture harness for visual review.
//   node tools/shot.mjs <outDir> [scenario ...]
// Scenarios:
//   menu                         main menu with map backdrop
//   play:<map>:<weapon>[:ads|:fire|:reload]   first-person in a live match
//   char:<map>[:front|:side|:crouch|:walk|:pistol|:death]   close-up of a bot
//   orbit:<map>:<x>:<z>:<h>:<lookX>:<lookZ>     free camera (props / architecture)
//   vfx:<map>:<kind>             kind = explosion | impacts | muzzle | blood | tracers
//   hud:<map>                    in-match HUD with killfeed, hitmarker, medals
//   sim                          60s simulated match per mode; prints runtime errors
// Defaults: all of the above for every map. Serves the repo itself on a random port.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
const PW = '/tmp/claude-0/-home-user-ATL/9c2d4c8c-1512-50ae-87c8-0acb110a2aa9/scratchpad/n/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const root = resolve(new URL('..', import.meta.url).pathname);
const out = resolve(process.argv[2] || 'shots');
mkdirSync(out, { recursive: true });
let scen = process.argv.slice(3);
const MAPS = ['bankhead', 'zone6', 'fivepoints', 'chopshop'];
if (!scen.length) scen = ['menu', ...MAPS.map((m) => `play:${m}:choppa`), 'char:zone6:front', 'char:bankhead:side', 'hud:bankhead', 'vfx:chopshop:explosion', 'sim'];

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.hdr': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ktx2': 'application/octet-stream', '.wasm': 'application/wasm' };
const srv = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const data = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForFunction(() => window.app, null, { timeout: 30000 });
await page.waitForTimeout(2500);

const start = (map, mode = 'tdm', weapon = 'choppa', bots = 9) => page.evaluate(({ map, mode, weapon, bots }) => {
  const app = window.app;
  app.profile.last = { ...app.profile.last, mode, map, bots, difficulty: 'regular' };
  app.profile.classes[0].primary = weapon; app.profile.selectedClass = 0;
  app.startMatch();
  const g = app.game;
  for (let i = 0; i < 60; i++) { g.update(1 / 30); app.hud.update(1 / 30); }
  if (!g.player.alive) g.spawn(g.player);
  g.player.health = 100;
}, { map, mode, weapon, bots });
const settle = (ms = 2500) => page.waitForTimeout(ms);
const quit = () => page.evaluate(() => { const a = window.app; if (a.player) a.player.mouse = [false, false, false]; a.paused = false; a.hud.show(false); a.quitMatch(); });
const snap = (name) => page.screenshot({ path: join(out, name + '.png') });

for (const s of scen) {
  const [kind, map = 'bankhead', a, b, c, d, e] = s.split(':');
  try {
    if (kind === 'menu') { await settle(1500); await snap('menu'); continue; }
    if (kind === 'play') {
      await start(map, 'tdm', a || 'choppa');
      if (b === 'ads') await page.evaluate(() => { window.app.player.mouse[2] = true; });
      if (b === 'fire') await page.evaluate(() => { window.app.player.mouse[0] = true; });
      if (b === 'reload') await page.evaluate(() => { const g = window.app.game; g.player.weapon.mag = 2; g.player.startReload(); });
      await settle(b ? 3500 : 2500);
      await snap(`play_${map}_${a || 'choppa'}${b ? '_' + b : ''}`);
      await quit();
    } else if (kind === 'char' || kind === 'orbit' || kind === 'vfx' || kind === 'hud') {
      await start(map, 'tdm', 'choppa', kind === 'hud' ? 9 : 5);
      await page.evaluate(({ kind, a, b, c, d, e }) => {
        const app = window.app, g = app.game, cam = app.camera;
        if (kind === 'hud') {
          const p = g.player, en = g.soldiers.filter((o) => g.isEnemy(p, o) && o.alive);
          g.damage(en[0], 200, p, 'choppa', { head: true, fromX: p.pos.x, fromZ: p.pos.z, dist: 45 });
          g.damage(en[1], 200, p, 'choppa', { fromX: p.pos.x, fromZ: p.pos.z, dist: 10 });
          g.damage(p, 45, en[2], 'choppa', { fromX: en[2].pos.x, fromZ: en[2].pos.z });
          return;
        }
        app.paused = true; app.hud.show(false);
        window.__shotCam = true;
        if (kind === 'char') {
          const bt = g.bots[0];
          for (const o of g.bots.slice(1)) { if (o.model) o.model.root.visible = false; o.alive = false; o.deadT = 99; }
          bt.alive = true; bt.pos.set(g.player.pos.x, 0, g.player.pos.z); bt.pos.y = g.world.groundAt(bt.pos.x, bt.pos.z, 0.3, 0); bt.yaw = 0; bt.pitch = 0.05;
          bt.crouchAmt = a === 'crouch' ? 1 : 0;
          if (a === 'pistol') { bt.equip(['deagle']); }
          bt.vel.set(0, 0, a === 'walk' ? -5 : 0); bt.walkPhase = a === 'walk' ? 1.2 : 0;
          if (a === 'death') { bt.alive = false; bt.deadT = 2; bt.deathFall = { dir: 1, side: 0.2 }; }
          g.player.model && (g.player.model.root.visible = false);
          g.animateModels(0);
          const ang = { side: 1.4, crouch: 0.6, walk: -0.5, pistol: 0.3, death: 0.9 }[a] ?? 0;
          const dist = { side: 1.8, death: 3 }[a] ?? 2.3;
          const fx = -Math.sin(ang), fz = -Math.cos(ang);
          cam.position.set(bt.pos.x + fx * dist, bt.pos.y + (a === 'crouch' ? 1.2 : a === 'death' ? 1.8 : 1.5), bt.pos.z + fz * dist);
          cam.lookAt(bt.pos.x, bt.pos.y + (a === 'crouch' ? 0.8 : a === 'death' ? 0.2 : 1.15), bt.pos.z);
          cam.fov = 50; cam.updateProjectionMatrix();
        } else if (kind === 'orbit') {
          cam.position.set(+a, +c, +b); cam.lookAt(+d, 1.5, +e); cam.fov = 70; cam.updateProjectionMatrix();
        } else if (kind === 'vfx') {
          const p = g.player; const T = window.THREE_NS;
          const fwd = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
          const at = { x: p.pos.x + fwd.x * 9, y: 0.2, z: p.pos.z + fwd.z * 9 };
          cam.position.set(p.pos.x, 1.7, p.pos.z); cam.lookAt(at.x, 1.2, at.z); cam.fov = 75; cam.updateProjectionMatrix();
          window.__vfx = { kind: a, at };
        }
      }, { kind, a, b, c, d, e });
      if (kind === 'vfx') {
        // run the effect for a few frames with the game unpaused but bots frozen
        await page.evaluate(async () => {
          const app = window.app, g = app.game, v = window.__vfx;
          const V = g.player.pos.constructor;
          const at = new V(v.at.x, v.at.y, v.at.z);
          for (const b of g.bots) { b.alive = false; if (b.model) b.model.root.visible = false; }
          if (v.kind === 'explosion') g.explode(at, g.player, 'frag', 7, 0);
          if (v.kind === 'impacts' || v.kind === 'tracers' || v.kind === 'muzzle') {
            for (let i = 0; i < 12; i++) { g.player.yaw += (Math.random() - 0.5) * 0.05; g.fire(g.player); }
          }
          if (v.kind === 'blood') g.effects.impact(new V(at.x, 1.3, at.z), null, true);
          for (let i = 0; i < 4; i++) g.effects.update(1 / 30);
        });
        await settle(1200);
      } else await settle(kind === 'hud' ? 1200 : 2500);
      await snap(`${kind}_${map}${a ? '_' + a : ''}${kind === 'orbit' ? '_' + [a, b, c].join('_') : ''}`);
      await quit();
    } else if (kind === 'sim') {
      const res = await page.evaluate(() => {
        const app = window.app, out = [];
        for (const [mode, map] of [['tdm', 'bankhead'], ['dom', 'zone6'], ['kc', 'fivepoints'], ['gun', 'chopshop'], ['ffa', 'bankhead']]) {
          app.profile.last = { ...app.profile.last, mode, map, bots: 11 };
          app.startMatch();
          const g = app.game;
          const t0 = performance.now();
          let steps = 0;
          while (!g.ended && steps < 30 * 60) {
            const p = app.player;
            if (g.player.alive) { p.keys = new Set(steps % 200 < 120 ? ['KeyW'] : ['KeyA']); p.mouse[0] = steps % 50 < 20; g.player.yaw += 0.01; }
            g.update(1 / 30); app.hud.update(1 / 30); steps++;
          }
          out.push(`${mode}/${map}: ${steps} steps, ${(performance.now() - t0).toFixed(0)}ms sim, kills ${g.soldiers.reduce((a, s) => a + s.kills, 0)}`);
          app.quitMatch();
        }
        return out;
      });
      console.log('SIM', res.join('\n    '));
    }
  } catch (e) { errs.push(`scenario ${s} failed: ${e.message}`); try { await quit(); } catch { /* ignore */ } }
}
const perf = await page.evaluate(() => { const r = window.app.renderer.info.render; return `draw calls last frame: ${r.calls}, triangles: ${r.triangles}`; }).catch(() => '');
console.log('PERF', perf);
console.log(errs.length ? 'ERRORS\n  ' + errs.join('\n  ') : 'NO ERRORS');
console.log('screenshots in', out);
await browser.close();
srv.close();
