// Copia app/ a dist/app con la versión de package.json (la usan el instalador de Tauri y el de Chrome)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const v = require(path.join(root, 'package.json')).version;
const out = path.join(root, 'dist', 'app');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'app'), out, { recursive: true, filter: s => !s.endsWith('.md') });
const f = path.join(out, 'app.js');
const src = fs.readFileSync(f, 'utf8');
const next = src.replace(/const APP_VERSION = '[^']*';/, `const APP_VERSION = '${v}';`);
if (!next.includes(`const APP_VERSION = '${v}';`)) throw new Error('No encontré APP_VERSION en app.js');
fs.writeFileSync(f, next);
console.log('dist/app lista (versión ' + v + ')');
