import { readFile, writeFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const [bundleArg, screen] = process.argv.slice(2);
const screens = ['cars', 'service', 'time', 'history', 'order'];
if (process.platform !== 'darwin' || process.env.GITHUB_ACTIONS !== 'true' || !screens.includes(screen)) {
  throw new Error('Only the GitHub macOS simulator capture job may prepare this bundle');
}
const bundle = resolve(bundleArg || '');
if (!bundle.endsWith('/Karpservice-Screenshots.app')) throw new Error('Refusing to modify the production app bundle');
const sdk = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :DTPlatformName', join(bundle, 'Info.plist')], { encoding: 'utf8' }).trim();
if (sdk !== 'iphonesimulator') throw new Error('Screenshot fixtures cannot run on a physical device build');
const publicDir = join(bundle, 'public');
const template = join(publicDir, 'index.screenshot-original');
let html;
try { html = await readFile(template, 'utf8'); }
catch { html = await readFile(join(publicDir, 'index.html'), 'utf8'); await writeFile(template, html); }
const anchor = '<script src="native.js"></script>';
if (html.split(anchor).length !== 2) throw new Error('Native bundle layout changed');
await cp(fileURLToPath(new URL('./fixture.js', import.meta.url)), join(publicDir, 'screenshot-fixture.js'));
await writeFile(join(publicDir, 'screenshot-screen.js'), `window.KarpScreenshotScreen = ${JSON.stringify(screen)};\n`);
html = html.replace(anchor, `${anchor}\n<script src="screenshot-screen.js"></script>\n<script src="screenshot-fixture.js"></script>`);
await writeFile(join(publicDir, 'index.html'), html);
console.log(`Prepared simulator-only screenshot: ${screen}`);
