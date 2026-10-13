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
replaceOnce('<span>Karpservice</span></div>', '<span id="nativeBrandTitle">Karpservice</span></div>');
replaceOnce('<h1 class="news-feed-title">Новини</h1>', '');
replaceOnce("  if (el) el.classList.add('active');", "  if (el) el.classList.add('active');\n  const brandTitle = document.getElementById('nativeBrandTitle');\n  if (brandTitle) brandTitle.textContent = ['home', 'newsDetail'].includes(id) ? 'Новини' : 'Karpservice';");
replaceOnce('<title>Karpservice — Онлайн-запис</title>', `<title>Karpservice — Онлайн-запис</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: https://cdn.bm.parts; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'">
<script src="native.js"></script>
<style>
/* Prevent accidental double-tap zoom, including inside nested scroll areas.
   Keep normal scrolling and deliberate pinch-to-zoom available. */
html,body,body *{touch-action:manipulation}
.profile-client-button{cursor:pointer}.profile-client-button:focus{outline:none}.profile-client-button.keyboard-focus:focus-visible{outline:2px solid var(--mint);outline-offset:-3px}
.native-mileage{display:block;width:auto;max-width:100%;padding:8px 0;margin:3px 0 0;border:0;background:transparent;color:var(--mint);font-size:14px;text-align:left;line-height:1.4}.native-mileage span{margin-left:4px}
.native-profile-dialog{width:calc(100% - 32px);max-width:460px;max-height:85dvh;overflow:auto;margin:auto;padding:22px;border:1px solid #35433f;border-radius:22px;background:#181f24;color:#f3f6f5;box-sizing:border-box;touch-action:manipulation}
.native-profile-dialog::backdrop{background:rgba(0,0,0,.72)}
.native-profile-dialog h2{margin:0 0 18px;font-size:24px}.native-profile-dialog input{width:100%;min-width:0;font-size:16px;box-sizing:border-box;color-scheme:dark}
.native-profile-row{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;background:#222c2e;color:#fff;margin:10px 0;padding:16px;border:1px solid #35433f;border-radius:14px}
.native-profile-row span{min-width:0}.native-profile-row small{display:block;color:#a1ada9;font-weight:400;margin-bottom:5px}.native-profile-row strong{display:block;overflow-wrap:anywhere;font-size:17px}.native-profile-row b{color:var(--mint)}
.native-profile-buttons{display:flex;gap:10px;margin-top:16px}.native-profile-buttons button{flex:1}
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
.car-logo > svg{width:38px;height:38px;color:#267b62}
.car-logo.car-logo-approved{background:transparent;border:0;box-shadow:none;padding:2px;border-radius:0}
.car-logo-light{filter:brightness(0) invert(1)}
.car-logo.car-logo-approved > svg{display:block;width:100%;height:100%;overflow:hidden}
.car-logo-crop{overflow:hidden}
.news-promo-image.native-promo-art{aspect-ratio:772/800;overflow:hidden}
</style>`);
replaceOnce('<div class="card profile-card">\n      <div class="profile-row">', '<div class="card profile-card">\n      <div class="profile-row profile-client-button" id="nativeEditProfile" role="button" tabindex="0" aria-haspopup="dialog" aria-label="Редагувати дані клієнта">');
replaceOnce('    <button class="secondary" type="button" onclick="logout()">Вийти з профілю</button>', `
    <dialog id="nativeProfileDialog" class="native-profile-dialog" aria-labelledby="nativeProfileTitle">
      <h2 id="nativeProfileTitle">Дані клієнта</h2>
      <button id="nativeChooseName" class="native-profile-row" type="button"><span><small>Ім’я</small><strong id="nativeProfileNameValue">—</strong></span><b aria-hidden="true">›</b></button>
      <button id="nativeChoosePhone" class="native-profile-row" type="button"><span><small>Номер телефону</small><strong id="nativeProfilePhoneValue">—</strong></span><b aria-hidden="true">›</b></button>
      <button id="nativeChooseBirth" class="native-profile-row" type="button"><span><small>Дата народження</small><strong id="nativeProfileBirthValue">Не вказано</strong></span><b aria-hidden="true">›</b></button>
      <p id="nativeProfileSaved" class="native-note" role="status"></p>
      <button id="nativeCloseProfile" class="secondary" type="button">Закрити</button>
    </dialog>
    <dialog id="nativeFieldDialog" class="native-profile-dialog" aria-labelledby="nativeFieldTitle">
      <form id="nativeFieldForm">
        <h2 id="nativeFieldTitle">Редагування</h2>
        <label id="nativeFieldLabel" for="nativeFieldInput">Ім’я</label>
        <input id="nativeFieldInput" type="text" maxlength="160">
        <p id="nativeFieldStatus" class="native-note" role="status" aria-live="polite"></p>
        <div class="native-profile-buttons"><button id="nativeFieldSave" class="primary" type="submit">Зберегти</button><button id="nativeFieldCancel" class="secondary" type="button">Скасувати</button></div>
      </form>
    </dialog>
    <dialog id="nativePhoneDialog" class="native-profile-dialog" aria-labelledby="nativePhoneTitle">
      <h2 id="nativePhoneTitle">Номер телефону</h2>
      <p class="native-note">Введіть новий номер та підтвердьте його кодом із Telegram. До підтвердження діятиме попередній номер.</p>
      <div id="nativePhoneContainer"></div>
      <button id="nativePhoneCancel" class="secondary" type="button">Скасувати</button>
    </dialog>
    <button class="secondary" type="button" onclick="logout()">Вийти з профілю</button>`);
replaceOnce('function renderProfile(){', `window.getEditableProfile = () => ({
  name: [customerData?.customer?.first_name, customerData?.customer?.last_name].filter(Boolean).join(' '),
  phone: customerData?.customer?.phone || '',
  birth_date: customerData?.customer?.birth_date || ''
});
window.applyProfileField = function(field, value){
  if (!customerData?.customer) return;
  if (field === 'name') { customerData.customer.first_name = value; customerData.customer.last_name = ''; }
  if (field === 'birth_date') customerData.customer.birth_date = value;
  renderProfile();
};
function renderProfile(){`);
replaceOnce("    authChallengeId = '';\n    await loadCustomer();", "    authChallengeId = '';\n    await loadCustomer(window.KarpProfileEditor?.editingPhone ? {targetScreen:'profile'} : {});\n    window.KarpProfileEditor?.phoneSaved();");
// Car cards keep booking in the central tab and expose editable mileage under VIN.
const carBookingButton = html.match(/        <button class="primary action-primary" type="button" onclick="startBooking\([\s\S]*?<\/button>/)?.[0];
if (!carBookingButton) throw new Error('Car booking button not found');
replaceOnce(carBookingButton, '');
replaceOnce("<div class=\"vin\">${escapeHtml(car.vin || '')}</div>", "<div class=\"vin\">${escapeHtml(car.vin || '')}</div><button class=\"native-mileage\" type=\"button\" data-mileage-car=\"${Number(car.id)}\" aria-haspopup=\"dialog\">Пробіг: ${car.mileage === null || car.mileage === undefined ? 'Вказати' : escapeHtml(Number(car.mileage).toLocaleString('uk-UA')) + ' км'} <span aria-hidden=\"true\">✎</span></button>");
replaceOnce('<div id="deleteCarModal"', `<dialog id="nativeMileageDialog" class="native-profile-dialog" aria-labelledby="nativeMileageTitle">
  <form id="nativeMileageForm">
    <h2 id="nativeMileageTitle">Пробіг автомобіля</h2>
    <p id="nativeMileageCar" class="native-note"></p>
    <label for="nativeMileageInput">Пробіг, км</label>
    <input id="nativeMileageInput" type="text" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="Наприклад, 150000" required>
    <p id="nativeMileageStatus" class="native-note" role="status" aria-live="polite"></p>
    <div class="native-profile-buttons"><button id="nativeMileageSave" class="primary" type="submit">Зберегти</button><button id="nativeMileageCancel" class="secondary" type="button">Скасувати</button></div>
  </form>
</dialog>
<div id="deleteCarModal"`);
replaceOnce('function renderCustomer(){', `window.getMileageCar = id => customerData?.cars?.find(car => Number(car.id) === id);
window.applyCarMileage = (id, mileage) => {
  for (const list of [customerData?.cars, customerData?.history_cars]) {
    for (const car of list || []) if (Number(car.id) === id) car.mileage = mileage;
  }
  renderCustomer();
};
function renderCustomer(){`);
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
// User approved these eight transparent logo previews on 2026-10-12.
// SVG viewports isolate each emblem without modifying the approved bitmap.
const brandFunction = html.match(/function carBrandLogo\(car\)\{[\s\S]*?\n\}/)?.[0];
if (!brandFunction) throw new Error('Car icon renderer not found');
replaceOnce(brandFunction, `function carBrandLogo(car){
  const brand = detectCarBrand(car);
  const viewports = {
    'mercedes-benz':'97 47 362 354', 'ford':'513 122 485 202',
    'land-rover':'45 461 484 255', 'bmw':'575 404 361 355',
    'audi':'39 856 501 186', 'volkswagen':'593 775 335 328',
    'toyota':'59 1144 452 289', 'skoda':'585 1117 346 342'
  };
  const viewport = brand && viewports[brand.slug];
  if (viewport) {
    const [, , width, height] = viewport.split(' ').map(Number);
    // The outer SVG fits the emblem into the square card slot. The inner SVG
    // clips to the exact sprite rectangle, excluding neighbours in letterboxing.
    return '<div class="car-logo car-logo-approved"><svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(brand.name) + '" focusable="false"><svg class="car-logo-crop" viewBox="' + viewport + '" width="' + width + '" height="' + height + '" overflow="hidden"><image href="car-brand-logos-approved.png" width="1024" height="1536" /></svg></svg></div>';
  }
  if (brand) {
    const opaque = {"omoda": [256, 256], "lada": [611, 256], "genesis": [661, 256], "jetour": [1584, 256]};
    const light = ['ram','cupra','jaguar','zeekr','nissan','polestar','cadillac','maserati','hummer'];
    if (opaque[brand.slug]) {
      const size = opaque[brand.slug];
      const filterId = 'brand-alpha-' + brand.slug + '-' + Number(car.id || 0);
      return '<div class="car-logo car-logo-approved"><svg viewBox="0 0 ' + size[0] + ' ' + size[1] + '" role="img" aria-label="' + escapeHtml(brand.name) + '" focusable="false"><defs><filter id="' + filterId + '" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.2126 -0.7152 -0.0722 0 1" /></filter></defs><image href="car-logos/' + brand.slug + '.png" width="' + size[0] + '" height="' + size[1] + '" filter="url(#' + filterId + ')" /></svg></div>';
    }
    return '<div class="car-logo car-logo-approved"><img class="' + (light.includes(brand.slug) ? 'car-logo-light' : '') + '" src="car-logos/' + brand.slug + '.png" alt="' + escapeHtml(brand.name) + '" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="car-logo-fallback" hidden aria-hidden="true">🚗</span></div>';
  }
  return '<div class="car-logo" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m10 22 4-10h20l4 10M8 22h32v16H8zM15 38v4M33 38v4M8 28h7M33 28h7M4 22h4M40 22h4M19 33h10"/></svg></div>';
}`);
replaceOnce('<section id="home" class="screen">', `<section id="home" class="screen">
    <article class="news-card">
      <img class="news-promo-image" style="aspect-ratio:auto" src="mechanic-vacancy-green.png" alt="Karpservice: шукаємо автомеханіка в команду, Бориспіль" loading="lazy" />
      <div class="news-description">
        <div class="news-kicker">Вакансія · Бориспіль</div>
        <h2>Шукаємо автомеханіка в команду Karpservice!</h2>
        <p>Любиш автомобілі та вмієш якісно їх ремонтувати? Приєднуйся до нашої команди в Борисполі. Розкажи про свій досвід — обговоримо роботу, графік та оплату особисто.</p>
        <button class="news-more" type="button" aria-label="Показати контакти" aria-expanded="false" aria-controls="mechanicVacancyDetails" onclick="toggleNewsDetails('mechanicVacancyDetails', this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>
        </button>
        <div id="mechanicVacancyDetails" class="news-details" hidden>
          <p><strong>Адреса:</strong> м. Бориспіль, вул. Київський Шлях, 10.</p>
          <p><strong>Телефонуй:</strong> <a href="tel:+380734447344">073 44 47 344</a></p>
        </div>
      </div>
    </article>`);
replaceOnce('<img class="news-promo-image" src="oil-change-promo-2026-09.jpg?v=1" alt="Акція Karpservice — безкоштовна заміна мастила та фільтрів" />', '<svg class="news-promo-image native-promo-art" viewBox="48 271 772 800" role="img" aria-labelledby="nativeOilPromoTitle"><title id="nativeOilPromoTitle">Безкоштовна заміна мастила та фільтрів при їх купівлі у Karpservice. Бориспіль, Київський Шлях, 10. 073 44 47 344.</title><image href="oil-promo-october-source.jpg" width="864" height="1536" /></svg>');
replaceOnce('    <button class="secondary" onclick="openCars()">До моїх авто</button>', `    <div id="nativeBookingActions" class="native-actions" hidden>
      <button id="nativeReminder" class="primary" type="button">Нагадати про запис</button>
      <button id="nativeShareBooking" class="secondary" type="button">Поділитися записом</button>
      <p class="native-note">Нагадування зберігається на цьому iPhone. Якщо час запису зміниться, видаліть старе нагадування в розділі «Профіль».</p>
      <p id="nativeBookingStatus" class="native-note" role="status"></p>
    </div>
    <button class="secondary" onclick="openCars()">До моїх авто</button>`);
replaceOnce('    <button class="secondary" type="button" onclick="logout()">Вийти з профілю</button>', `    <div class="native-actions">
      <button id="nativeLinkPhone" class="primary" type="button" onclick="resetAuthFlow(); show('phoneLink')">Підключити номер телефону</button>
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
  if (!customerData && !['home', 'newsDetail', 'shop', 'shopProducts', 'shopCart', 'guestServices', 'guestContacts', 'login'].includes(id)) id = 'login';
  if (customerData?.phone_linked === false && !['home', 'newsDetail', 'shop', 'shopProducts', 'shopCart', 'profile', 'phoneLink', 'login', 'guestServices', 'guestContacts'].includes(id)) id = 'profile';`);
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
<div id="nativePhoneFlow">
${phoneFlow.replace(/\n  <\/section>$/, '\n</div>\n  </section>')}`);
html = html.replace('>Увійти</button>', '>Підтвердити номер</button>');
html = html.replace("btn.textContent = 'Увійти';", "btn.textContent = 'Підтвердити номер';");
await writeFile(`${out}/index.html`, html);
for (const asset of ['shop.js', 'shop.css', 'news-vacancy-wide.jpg', 'news-oil-wide.jpg', 'logo.jpg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest']) {
  await cp(`${root}${asset}`, `${out}/${asset}`, { recursive: true });
}
await cp(`${mobile}public`, out, { recursive: true });
await cp(`${root}car-logos`, `${out}/car-logos`, { recursive: true });
await build({ entryPoints: [`${mobile}src/native.js`], bundle: true, format: 'iife', target: 'safari15', outfile: `${out}/native.js`, minify: true });
console.log('Built bundled iOS web assets in mobile/dist.');
