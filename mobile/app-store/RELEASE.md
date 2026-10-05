# Підготовка до App Store

**Актуальний стан, 5 жовтня 2026:** Apple відхилила 1.0 (10.1.0) за правилом 4.8. Реалізація Sign in with Apple пройшла перевірки, компіляцію для iPhone і знімання скриншотів у CI 37307785107. Опис і перший скриншот оновлено в App Store Connect, декларацію email опубліковано, політику приватності викладено через GitHub Pages. Блокер: одноразове завантаження приватного ключа Apple не повернуло файл; власник зареєстрував заміну D4WWA7W6LX з тими самими правами. Apple показує Download неактивною, файлу та GitHub secret немає; потрібно з’ясувати, чи файл завантажений на пристрій власника. Новий серверний код не розгорнуто, підписаної збірки й повторної подачі ще немає. Детальний стан та наступні кроки — в `apple-sign-in.md`. Записи нижче є історією попередніх етапів.

27 вересня 2026 року власник завершив реєстрацію Apple Developer, зареєстрував `ua.karpservice.client` у команді `L6W4586456` і створив картку Karpservice в App Store Connect (SKU `karpservice-ios`, українська мова, iOS 1.0). Оновлення **1.0 (3.1.0)** доставлене через TestFlight. Після виправлення кнопки «Запис» власник підтвердив «все працює» й доручив публікувати. Публічна версія поки залишається чернеткою; App Review не виконувався.

## Збережено в App Store Connect — 27 вересня

- Версія 1.0 використовує перевірену збірку **3.1.0**. Збережено український опис, рекламний текст, ключові слова, підзаголовок, Utilities, copyright і контакт App Review.
- Ціна безкоштовна; перша територія — **Україна**. Обрано автоматичний випуск після схвалення Apple; розповсюдження на Mac і Vision Pro вимкнено.
- Анкету вікового рейтингу завершено: **4+**.
- Опубліковано й перевірено сторінку підтримки: https://karpservice-app.jeweled-astrodon.workers.dev/support/ . Адресу збережено в картці версії. Зміна production `main` додає тільки `support/index.html` і `support/info.css`.
- App Privacy: Name, Phone Number, Other User Content, User ID, Purchase History, Other Diagnostic Data, Other Data Types. Для всіх вказано App Functionality, Linked to User, No Tracking. Анкету опубліковано, що підтверджено статусом Published у App Store Connect; фінальна Privacy Policy URL не задана.
- У [CI 36339621158](https://github.com/venyast31-cmyk/karpservice/actions/runs/36339621158) підготовлено 5 фактичних знімків iPhone 14 Plus, 1284 × 2778: авто, послуга, дата/час, історія, деталі ремонту. Використано вигаданого клієнта в окремій копії симуляторного застосунку без реальних API-запитів. Production-збірка та автентифікація не змінені. Знімки візуально перевірено, з непрозорих PNG прибрано зайвий alpha-канал без зміни пікселів. Після відновлення входу незавершені записи замінено; усі 5 зображень завантажено в українську локалізацію iPhone 6.5" у вказаному порядку. Після перезавантаження Media Manager показує всі 5 мініатюр із CDN Apple.

## Що заважає подачі

- Apple має самостійно увійти в контрольований тестовий профіль. Короткочасний OTP у Telegram власника цього не забезпечує. Дані входу для Review Information поки порожні. Не додавати універсальний код чи доступ до реальних клієнтів.
- Фінальна публічна політика має відповідати фактичному оператору, зберіганню CRM-історії та процесу видалення. Додатково врахувати VIN-сервіс **db.vin**, якому сервер передає VIN для розпізнавання авто.
- У Content Rights не слід заявляти відсутність стороннього контенту: застосунок містить логотипи марок авто. Потрібна правдива відповідь про права їх використання.

Детальні технічні відомості та конкретні невизначені пункти політики: `privacy-policy.uk.draft.md`.

Автоматична перевірка безпеки інструмента заблокувала дію Add for Review через відсутні дані входу для рев’юера та Privacy Policy URL. Дію не виконано; це не відмова Apple. Повторної чи обхідної подачі не здійснювали. Завершено незалежні роботи з анкетою приватності та скриншотами.

Хмарну збірку, підпис і завантаження в TestFlight перевірено в окремому workflow — див. `TESTFLIGHT.md`. Ключ App Store Connect із роллю Developer, сертифікат і профіль підключено через GitHub Actions Secrets. Це не означає, що застосунок уже опублікований або схвалений App Review.

## До підписання та подачі

1. Пройти реальний сценарій на iPhone: початкова прив’язка Telegram, OTP, перезапуск, завершення сесії, вихід, історія, запис і нагадування. Для першого тесту використати виділений тестовий CRM-контакт; тестові замовлення не створювати від імені реальних клієнтів.
2. Оцінити обов’язковий Telegram-вхід за правилами 4.2.3(i) та 4.8. Вхід залишено таким, як його замовляв власник. Це власний OTP-процес через бота, а не кнопка Telegram OAuth, але залежність від іншого застосунку потребує перевірки. Не обіцяти прийняття Apple. Не додавати альтернативний вхід без рішення власника.
3. Підготувати контрольований обліковий запис для рев’ю Apple і точну інструкцію входу. Не публікувати його дані у GitHub. Не додавати прихований універсальний код, тестовий обхід авторизації або недокументований деморежим. Не відправляти OTP реальним клієнтам для перевірки.
4. Додати повні відомості власника/оператора персональних даних, контакт щодо приватності, цілі та строки зберігання/видалення CRM-даних, умови сторонніх постачальників і права користувача до фінальної політики. Опублікувати стабільні загальнодоступні HTTPS-адреси підтримки та політики й внести їх у `metadata.uk.json`. `public/privacy.html` зараз пояснює технічну реалізацію; власник має завершити політику перед випуском.
5. Узгодити видалення акаунта й даних. Нині в застосунку немає самостійної реєстрації клієнта: він входить у наявний CRM-профіль. Вихід або приховування авто НЕ є видаленням акаунта. Перевірити, чи прив’язка Telegram утворює акаунт у розумінні Apple. Якщо правило 5.1.1(v) застосовується, до подачі реалізувати запуск видалення в застосунку з коректним очищенням прив’язки, сесій та даних; одного телефонного звернення недостатньо. Для історії ремонтів окремо визначити, які записи мають залишатися за законом. Не видаляти CRM-історію без цього рішення.
6. App Privacy опубліковано на основі перевіреного коду. Оновлювати анкету, якщо рішення щодо входу чи видалення змінять обробку даних. Privacy manifest не замінює цю анкету.
7. Фінальні скриншоти завантажено, рейтинг 4+ збережено. Залишається підтвердити права на бренд/логотипи автомобілів та заповнити Content Rights.

## Наступний етап: TestFlight

Підписану збірку завантажено, створено внутрішню групу «Тест Karpservice» без автоматичного розповсюдження майбутніх збірок. Apple завершила обробку оновлення; **1.0 (3.1.0)** уже в групі зі статусом **Testing**. Власник схвалив запрошення, установив застосунок і підтвердив доступ до історії на iPhone. У сценарії з кількома авто центральна кнопка «Запис» зверталася до видаленого заголовка; помилку виправлено. О 21:03 за Києвом власник підтвердив роботу виправленого застосунку й доручив публікувати. Це не є окремим доказом перевірки кожної системної функції чи завершення реального бронювання. Подача на App Review — після завершення матеріалів і пунктів вище. Автоматичний workflow завантажує збірку, але не подає на App Review і не публікує її.

## Інструкція рев’юеру — чернетка

Karpservice is a client companion app for an auto service in Boryspil, Ukraine. Existing customers can inspect their vehicles and service history and book a workshop visit. Appointments concern physical services; there are no digital purchases. The frontend is bundled in the app. iOS features include local appointment reminders, a share sheet and secure session storage.

The current app does not let users create CRM customer records. Access is through the phone number on an existing service record, verified by a one-time code delivered by the Karpservice Telegram bot. Before submission, provide a dedicated review account and reproducible login instructions in the private Review Information field. Do not submit this paragraph as a substitute for credentials.

## Джерела правил

- https://developer.apple.com/app-store/review/guidelines/ — 2.1, 4.2, 4.8, 5.1.
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
- https://developer.apple.com/news/upcoming-requirements/?id=04282026a — мінімальні SDK для подачі.
- https://developer.apple.com/programs/enroll/
- https://capacitorjs.com/docs/ios

Правила слід звірити ще раз перед фактичною подачею.

## Уточнення власника та оновлення після 22:22

Власник погодив відкритий локальний деморежим, указав оператора **ФОП Карпенко Євгеній Ігорович**, підтвердив постійне зберігання історії з видаленням на запит та відсутність прав на логотипи автомарок. Додано локальний деморежим із пробним бронюванням, оригінальні нейтральні іконки, рекламну картку без сторонніх зображень та остаточну політику. Демо не має облікового запису, секретного коду чи доступу до production API. Клієнтський Telegram-вхід і серверні дозволи незмінні. Модельні перевірки ізоляції та повернення до звичайного входу пройшли.

Ці зміни потребують нової фізичної збірки та нових скриншотів; чинна 3.1.0 їх не містить. Попереднє автоматичне блокування Add for Review не обійдено. Apple 2.1(a) передбачає попереднє погодження деморежиму замість тестового акаунта. Політика чесно описує ручне видалення, але запуск запиту на видалення всередині застосунку ще не реалізований. Потрібно завершити це питання для Telegram-прив’язки перед подачею, не називати вихід або приховування авто видаленням профілю.


## Superseding instruction — 2026-09-27 22:52 Europe/Kyiv

The owner explicitly requested removal of demo mode. The public demo, entry button, banner, data module and demo-specific reminders/sharing have been removed. Telegram login remains mandatory. Neutral artwork and the confirmed privacy policy remain. Simulator screenshots use isolated fictional read-only fixtures that are never included in device builds. Build 4.1.0 contains the withdrawn demo and must not be selected for this release. A replacement build is required.

Apple demo-approval request withdrawn and not sent. App Review now needs a usable review account/access arrangement for Telegram login. No reviewer credentials were invented. The account-deletion backend is prepared but not deployed; its UI integration is preserved separately in deletion-ui-preparation.patch and is not included in the app until the operator confirms a deadline and the backend is deployed. The patch was recorded before removal of demo and requires adapting to the current native.js.


## Update 2026-09-27 23:11 Europe/Kyiv — public demo restored

The owner now explicitly requests a public demo without Telegram login, superseding the removal instruction above. Restored the tested local demo from 934359e: visible entry, fictional cars and history, isolated trial bookings, a clear demo banner and exit. Live login and production access controls are unchanged. Build 5.1.0 remains selected in Apple until the replacement is uploaded and processed. No App Review submission or public release has occurred. Prior Apple approval for using demo instead of a reviewer account is still pending; no approval request has been sent. The prepared deletion backend and unapplied UI patch remain unchanged and are not deployed.
