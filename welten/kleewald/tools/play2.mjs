import { createRequire } from 'module';
// Playwright: lokal installiert (npm i -D playwright) oder global unter /opt/node-tools
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch (e) { pw = req('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;
import path from 'path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
const logs = [];
p.on('console', (m) => { const t = m.text(); if (!/GPU stall|Automatic fallback/.test(t)) logs.push(m.type() + ': ' + t.slice(0, 400)); });
p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' ' + (e.stack || '').slice(0, 300)));
await p.goto('file://' + path.resolve('dist/index.html') + '?q=low&noadapt=1');
const st = async (label) => console.log(label, JSON.stringify(await p.evaluate(() => ({ seed: window.__stats && window.__stats.seed, origin: window.__stats && window.__stats.origin, pos: window.__stats && window.__stats.pos, busy: window.__stats && window.__stats.busy, chunks: window.__stats && window.__stats.chunks, hud: document.getElementById('hudS').textContent, hint: document.getElementById('hint').textContent, saved: (() => { try { return localStorage.getItem('noctiluca-seed'); } catch (e) { return 'n/a'; } })() }))));
await p.waitForTimeout(30000); await st('loaded');
await p.click('#start', { timeout: 60000 }).catch((e) => console.log('click failed'));
await p.waitForTimeout(4000);
await p.keyboard.press('KeyR'); await p.waitForTimeout(3000); await st('R pressed');
await p.waitForTimeout(40000); await st('after new world');
await p.keyboard.press('KeyF'); await p.waitForTimeout(5000); await st('walk in new world');
console.log([...new Set(logs)].join('\n') || 'no console errors');
await b.close();
