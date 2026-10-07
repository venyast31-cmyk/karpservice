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
.apple-login{display:block;width:100%;height:54px;padding:0;margin:18px 0 8px;border:0;border-radius:12px;background:#fff;color:#000;font:600 18px -apple-system,sans-serif;overflow:hidden}
.apple-login img{width:100%;height:54px;display:block}.apple-login:disabled{opacity:.55}.apple-login:active{opacity:.8}
.native-actions{margin:16px 0}
.native-actions button{margin-top:10px}
.native-ios input,.native-ios textarea,.native-ios select{font-size:16px}
.native-ios::after{content:"";position:fixed;z-index:10000;top:0;right:0;left:0;height:env(safe-area-inset-top,0px);background:#0d1014;pointer-events:none}
.native-demo{border:1px solid #397d68;background:#103b30;border-radius:14px;padding:12px 14px;margin-bottom:18px;display:flex;align-items:center;gap:12px;font-size:13px;color:#d8f9eb}
.native-demo[hidden]{display:none}.native-demo strong{display:block}.native-demo button{flex:0 0 auto;width:auto;margin:0;padding:8px 12px;font-size:13px}
.car-logo svg{width:38px;height:38px;color:#267b62}.native-promo{padding:28px;background:linear-gradient(150deg,#084d38,#0a3028);border:1px solid #30745d;border-radius:22px;color:#fff}.native-promo img{width:56px;border-radius:12px}.native-promo strong{display:block;font-size:32px;line-height:1.12;margin:24px 0 18px}.native-promo p{font-size:17px;color:#d9eddf;margin:0}
</style>`);
replaceOnce('<div class="app">', '<div class="app">\n<div id="nativeOffline" class="native-notice" role="status" hidden>Немає інтернету. Перевірте з’єднання та спробуйте ще раз.</div>\n<div id="nativeDemoBanner" class="native-demo" role="status" hidden><div><strong>Демо · вигадані дані</strong>Записи залишаються на цьому пристрої.</div><button id="nativeDemoExit" class="secondary" type="button">Вийти</button></div>');
replaceOnce('Введіть номер із нашої CRM та підтвердьте вхід через Telegram.', 'Увійдіть через Apple. Потім підключіть номер телефону, щоб побачити свої авто та історію обслуговування.');
replaceOnce('    <div id="phoneAuthStep" class="card auth-step">', `    <button id="nativeAppleLogin" class="apple-login" type="button" aria-label="Увійти через Apple">Увійти через Apple</button>
    <p id="nativeAppleStatus" class="native-note" role="status"></p>
    <div id="phoneAuthStep" class="card auth-step">`);
replaceOnce('<span>Номер телефону</span><strong id="profilePhone">', '<span id="profileContactLabel">Контакт</span><strong id="profilePhone">');
replaceOnce("  document.getElementById('profilePhone').textContent = phone || 'Підтверджено через Telegram';", `  document.getElementById('profilePhone').textContent = phone || customer.email || 'Підтверджено';
  document.getElementById('profileContactLabel').textContent = phone ? 'Номер телефону' : 'Email Apple';
  document.getElementById('nativeLinkPhone').hidden = customerData?.phone_linked !== false;`);
html = html.replaceAll('Сесія завершилася. Підтвердьте вхід через Telegram ще раз.', 'Сесія завершилася. Увійдіть у профіль ще раз.');
replaceOnce('Запис успішно створено в RO App. Майстра сервіс призначить окремо.', 'Ваш запис на сервіс створено. До зустрічі в Karpservice!');
replaceOnce('<div class="slot" onclick="pickSlot(this)">09:00</div>', '<div class="slot" onclick="pickSlot(this)">09:30</div>');
replaceOnce("  window.requestAnimationFrame(() => document.getElementById('phone')?.focus());", '  // On iPhone, open the phone keyboard only after the user taps the field.');
replaceOnce([
  "    if (typeof data.token === 'string' && /^[A-Za-z0-9_-]{40,100}$/.test(data.token)){",
  "      legacyAuthToken = data.token;",
  "      try{ window.sessionStorage.setItem(LEGACY_AUTH_TOKEN_KEY, data.token); }catch{}",
  "    }else{",
  "      throw new Error('Сервіс не повернув токен входу.');",
  "    }"
].join('\n'), "    if (data.session_stored !== true) throw new Error('Не вдалося зберегти вхід.');\n    clearLegacyAuthToken();");
// Owner confirmed that no rights to automaker logos are held. Ship original neutral artwork.
const brandFunction = html.match(/function carBrandLogo\(car\)\{[\s\S]*?\n\}/)?.[0];
if (!brandFunction) throw new Error('Car icon renderer not found');
replaceOnce(brandFunction, `function carBrandLogo(){
  return '<div class="car-logo" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m10 22 4-10h20l4 10M8 22h32v16H8zM15 38v4M33 38v4M8 28h7M33 28h7M4 22h4M40 22h4M19 33h10"/></svg></div>';
}`);
replaceOnce('<img class="news-promo-image" src="oil-change-promo-2026-09.jpg?v=1" alt="Акція Karpservice — безкоштовна заміна мастила та фільтрів" />', '<div class="native-promo"><img src="logo.jpg" alt="Karpservice"><strong>Безкоштовна заміна мастила та фільтрів</strong><p>При купівлі мастила та фільтрів у Karpservice</p></div>');
replaceOnce('    <button class="secondary" onclick="openCars()">До моїх авто</button>', `    <div id="nativeBookingActions" class="native-actions" hidden>
      <button id="nativeReminder" class="primary" type="button">Нагадати про запис</button>
      <button id="nativeShareBooking" class="secondary" type="button">Поділитися записом</button>
      <p class="native-note">Нагадування зберігається на цьому iPhone. Якщо час запису зміниться, видаліть старе нагадування в розділі «Профіль».</p>
      <p id="nativeBookingStatus" class="native-note" role="status"></p>
    </div>
    <button class="secondary" onclick="openCars()">До моїх авто</button>`);
replaceOnce('    <button class="secondary" type="button" onclick="logout()">Вийти з профілю</button>', `    <div class="native-actions">
      <button id="nativeLinkPhone" class="primary" type="button" onclick="resetAuthFlow(); show('phoneLink')">Підключити номер телефону</button>
      <button id="nativeRefresh" class="secondary" type="button">Оновити дані</button>
      <button id="nativeClearReminders" class="secondary" type="button">Видалити мої нагадування</button>
      <button id="nativeOpenSettings" class="secondary" type="button">Налаштування сповіщень</button>
      <button id="nativeDeleteAccount" class="secondary" type="button">Видалити профіль і дані</button>
      <p id="nativeProfileStatus" class="native-note" role="status"></p>
    </div>
    <nav class="native-links" aria-label="Інформація"><a href="support.html">Підтримка</a><a href="privacy.html">Приватність</a></nav>
    <button class="secondary" type="button" onclick="logout()">Вийти з профілю</button>`);
// Public catalogue uses the same services as booking, without CRM or demo data.
const serviceSection = html.match(/<section id="service"[\s\S]*?<\/section>/)?.[0];
const publicServices = [...(serviceSection || '').matchAll(/<div class="service" onclick="pick\(this\)">([\s\S]*?)\n    <\/div>/g)]
  .map(([, content]) => `<article class="card">${content}</article>`).join('\n');
if ((publicServices.match(/<article/g) || []).length !== 4) throw new Error('Review public service catalogue');
replaceOnce('<section id="login" class="screen active">', `<section id="guestServices" class="screen">
    <h1>Послуги Karpservice</h1>
    <p>Переглядайте послуги без входу. Для оформлення запису потрібен ваш профіль та автомобіль.</p>
    ${publicServices}
    <p class="small">Тривалість орієнтовна. Вартість уточнюємо перед виконанням робіт.</p>
    <button class="primary" type="button" onclick="customerData ? openQuickBooking() : openGuestLogin()">Записатися на сервіс</button>
    <button class="secondary" type="button" onclick="show('guestContacts')">Контакти та години роботи</button>
  </section>
  <section id="guestContacts" class="screen">
    <h1>Контакти Karpservice</h1>
    <div class="card"><h2>Автосервіс у Борисполі</h2><p>вул. Київський Шлях, 10</p>
    <p>Пн–Сб: 09:30–18:00<br>Неділя — вихідний</p>
    <p><a href="tel:+380734447344">073 44 47 344</a></p></div>
    <nav class="native-links" aria-label="Інформація сервісу"><a href="support.html">Підтримка</a><a href="privacy.html">Приватність</a></nav>
    <button class="secondary" type="button" onclick="show('guestServices')">Переглянути послуги</button>
  </section>
  <section id="login" class="screen active">
    <button class="secondary" type="button" onclick="show('guestServices')">Переглянути послуги без входу</button>`);
replaceOnce('  body.is-authenticated .bottom-nav{display:grid}', '  .bottom-nav{display:grid}');
replaceOnce('  body.is-authenticated .app{', '  .app{');
replaceOnce('function show(id){', `function show(id){
  if (!customerData && !['home', 'guestServices', 'guestContacts', 'login'].includes(id)) id = 'login';
  if (customerData?.phone_linked === false && !['home', 'profile', 'phoneLink', 'login', 'guestServices', 'guestContacts'].includes(id)) id = 'profile';`);
replaceOnce("    home:'homeNav', cars:'carsNav', addCar:'carsNav',", "    home:'homeNav', guestServices:'bookingNav', guestContacts:'profileNav', phoneLink:'profileNav', cars:'carsNav', addCar:'carsNav',");
replaceOnce('async function openClientHome(){', `function openGuestLogin(){
  resetAuthFlow();
  show('login');
}
async function openClientHome(){
  if (!customerData) { show('home'); return; }`);
for (const name of ['openCars', 'openAddCar', 'openAllHistory']) {
  replaceOnce(`function ${name}(){\n  if (!customerData){\n    openClientHome();`, `function ${name}(){\n  if (!customerData){\n    openGuestLogin();`);
}

replaceOnce("  resetAuthFlow();\n  show('login');\n}\n\nfunction updateBookingProgress", "  resetAuthFlow();\n  show('home');\n}\n\nfunction updateBookingProgress");
replaceOnce('  await loadCustomer({initial:true});', "  await loadCustomer({initial:true});\n  if (!customerData) show('home');");
const phoneFlow = html.match(/    <div id="phoneAuthStep"[\s\S]*?\n  <\/section>/)?.[0];
if (!phoneFlow) throw new Error('Phone linking flow not found');
replaceOnce(phoneFlow, `  </section>
  <section id="phoneLink" class="screen">
    <h1>Підключіть номер телефону</h1>
    <p>Підтвердьте номер через Telegram. За ним знайдемо ваші авто та історію у Karpservice.</p>
${phoneFlow}`);
html = html.replace('>Увійти</button>', '>Підтвердити номер</button>');
html = html.replace("btn.textContent = 'Увійти';", "btn.textContent = 'Підтвердити номер';");
await writeFile(`${out}/index.html`, html);
for (const asset of ['logo.jpg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest']) {
  await cp(`${root}${asset}`, `${out}/${asset}`, { recursive: true });
}
await cp(`${mobile}public`, out, { recursive: true });
await build({ entryPoints: [`${mobile}src/native.js`], bundle: true, format: 'iife', target: 'safari15', outfile: `${out}/native.js`, minify: true });
console.log('Built bundled iOS web assets in mobile/dist.');
