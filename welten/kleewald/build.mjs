import esbuild from 'esbuild'; import fs from 'fs';
const minify = !process.argv.includes('--dev');
const w = await esbuild.build({ entryPoints: ['src/worker.js'], bundle: true, write: false, format: 'iife', minify, target: 'es2020' });
const workerSrc = w.outputFiles[0].text;
const m = await esbuild.build({
  entryPoints: ['src/main.js'], bundle: true, write: false, format: 'iife', minify, target: 'es2020',
  define: { __WORKER_SRC__: JSON.stringify(workerSrc) }, legalComments: 'none',
});
const js = m.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync('src/index.html', 'utf8').replace('/*__BUNDLE__*/', () => js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
console.log('built', (html.length / 1024).toFixed(0) + ' KB');
