// usage: node tools/shots.mjs prefix "query" w h  'JSON array of states'
import { createRequire } from 'module';
// Playwright: lokal installiert (npm i -D playwright) oder global unter /opt/node-tools
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch (e) { pw = req('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;
import path from 'path'; import fs from 'fs';
const [prefix, query = '', w = '1100', h = '620', statesJson = '[]'] = process.argv.slice(2);
const states = JSON.parse(statesJson);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
p.on('console', (m) => { const t = m.text(); if (!/GPU stall|Automatic fallback/.test(t)) logs.push(m.type() + ': ' + t.slice(0, 700)); });
p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html') + '?' + query + '&noadapt=1&ui=0&freeze=1&mode=fly');
async function settle(maxMs, need) {
  const t0 = Date.now(); let idle = 0, last = null, lastFrame = -1;
  while (Date.now() - t0 < maxMs) {
    await p.waitForTimeout(1200);
    const s = await p.evaluate(() => window.__stats || null); last = s;
    if (s && s.busy === 0 && s.frame > 3 && s.frame !== lastFrame) { idle++; if (idle >= need) break; } else if (s && s.busy > 0) idle = 0;
    if (s) lastFrame = s.frame;
  }
  return last;
}
if (!states.length) states.push({});
for (let i = 0; i < states.length; i++) {
  const st = states[i];
  await p.evaluate((o) => { window.__pause = false; window.__shot = null; window.__set(o); if (o.js) (0, eval)(o.js); }, st);
  const s = await settle(+(process.env.MAXT || 150000), st.settle || 3);
  await p.evaluate(() => { window.__wantShot = true; });
  let data = null;
  for (let k = 0; k < 240 && !data; k++) { await p.waitForTimeout(700); data = await p.evaluate(() => window.__shot || null); }
  const name = prefix + (st.name || i) + '.png';
  if (data) fs.writeFileSync(name, Buffer.from(data.split(',')[1], 'base64')); else console.log('NO SHOT', i);
  console.log(name, JSON.stringify(s));
}
console.log([...new Set(logs)].slice(0, 20).join('\n'));
await b.close();
