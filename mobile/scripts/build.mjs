import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const mobile = fileURLToPath(new URL('../', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = `${mobile}dist`;
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
let html = await readFile(`${root}index.html`, 'utf8');
const replaceOnce = (search, value) => {
  if (html.split(search).length !== 2) throw new Error(`Frontend changed; review mobile insertion: ${search.slice(0, 100)}`);
  html = html.replace(search, value);
};
replaceOnce('<title>Karpservice — Онлайн-запис</title>', `<title>Karpservice — Онлайн-запис</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'">
<script src="native.js"></script>
<style>
.native-links{display:flex;justify-content:center;gap:16px;flex-wrap:wrap;margin:22px 0;font-size:14px}
.native-links a{color:#98cdb6;text-underline-offset:4px}
.native-notice{padding:12px 16px;margin:12px 0;border:1px solid #f3b63f;border-radius:12px;color:#f3b63f}
.native-notice[hidden],#nativeBookingActions[hidden]{display:none}
.native-note{font-size:13px;color:#98a2af;line-height:1.5}
.native-actions{margin:16px 0}
.native-actions button{margin-top:10px}
.native-ios input,.native-ios textarea,.native-ios select{font-size:16px}
</style>`);
replaceOnce('<div class="app">', '<div class="app">\n<div id="nativeOffline" class="native-notice" role="status" hidden>Немає інтернету. Перевірте з’єднання та спробуйте ще раз.</div>');
replaceOnce('Введіть номер із нашої CRM та підтвердьте вхід через Telegram.', 'Введіть номер, який ви залишали в сервісі, та підтвердьте вхід через Telegram.');
replaceOnce('Запис успішно створено в RO App. Майстра сервіс призначить окремо.', 'Ваш запис на сервіс створено. До зустрічі в Karpservice!');
replaceOnce('<div class="slot" onclick="pickSlot(this)">09:00</div>', '<div class="slot" onclick="pickSlot(this)">09:30</div>');
replaceOnce([
  "    if (typeof data.token === 'string' && /^[A-Za-z0-9_-]{40,100}$/.test(data.token)){",
  "      legacyAuthToken = data.token;",
  "      try{ window.sessionStorage.setItem(LEGACY_AUTH_TOKEN_KEY, data.token); }catch{}",
  "    }else{",
  "      throw new Error('Сервіс не повернув токен входу.');",
  "    }"
].join('\n'), "    if (data.session_stored !== true) throw new Error('Не вдалося зберегти вхід.');\n    clearLegacyAuthToken();");
replaceOnce('    <div class="security-note">', `    <nav class="native-links" aria-label="Інформація"><a href="support.html">Підтримка</a><a href="privacy.html">Приватність</a></nav>
    <div class="security-note">`);
replaceOnce('    <button class="secondary" onclick="openCars()">До моїх авто</button>', `    <div id="nativeBookingActions" class="native-actions" hidden>
      <button id="nativeReminder" class="primary" type="button">Нагадати про запис</button>
      <button id="nativeShareBooking" class="secondary" type="button">Поділитися записом</button>
      <p class="native-note">Нагадування зберігається на цьому iPhone. Якщо час запису зміниться, видаліть старе нагадування в розділі «Профіль».</p>
      <p id="nativeBookingStatus" class="native-note" role="status"></p>
    </div>
    <button class="secondary" onclick="openCars()">До моїх авто</button>`);
replaceOnce('    <button class="secondary" type="button" onclick="logout()">Вийти з профілю</button>', `    <div class="native-actions">
      <button id="nativeRefresh" class="secondary" type="button">Оновити дані</button>
      <button id="nativeClearReminders" class="secondary" type="button">Видалити мої нагадування</button>
      <button id="nativeOpenSettings" class="secondary" type="button">Налаштування сповіщень</button>
      <p id="nativeProfileStatus" class="native-note" role="status"></p>
    </div>
    <nav class="native-links" aria-label="Інформація"><a href="support.html">Підтримка</a><a href="privacy.html">Приватність</a></nav>
    <button class="secondary" type="button" onclick="logout()">Вийти з профілю</button>`);
await writeFile(`${out}/index.html`, html);
for (const asset of ['logo.jpg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'oil-change-promo-2026-09.jpg', 'car-logos']) {
  await cp(`${root}${asset}`, `${out}/${asset}`, { recursive: true });
}
await cp(`${mobile}public`, out, { recursive: true });
await build({ entryPoints: [`${mobile}src/native.js`], bundle: true, format: 'iife', target: 'safari15', outfile: `${out}/native.js`, minify: true });
console.log('Built bundled iOS web assets in mobile/dist.');
