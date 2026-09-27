# Підготовка до App Store

27 вересня 2026 року власник завершив реєстрацію Apple Developer, зареєстрував `ua.karpservice.client` у команді `L6W4586456` і створив картку Karpservice в App Store Connect (SKU `karpservice-ios`, українська мова, iOS 1.0). Це підтверджено його скриншотами. Статус картки — підготовка до відправлення; завантаженої збірки ще немає.

Хмарну збірку й завантаження в TestFlight підготовлено в окремому workflow. Потрібно підключити ключ App Store Connect, сертифікат із приватним ключем і профіль підписання — див. `TESTFLIGHT.md`. Цей пакет не означає, що застосунок уже опублікований або схвалений Apple.

## До підписання та подачі

1. Пройти реальний сценарій на iPhone: початкова прив’язка Telegram, OTP, перезапуск, завершення сесії, вихід, історія, запис і нагадування. Для першого тесту використати виділений тестовий CRM-контакт; тестові замовлення не створювати від імені реальних клієнтів.
2. Оцінити обов’язковий Telegram-вхід за правилами 4.2.3(i) та 4.8. Вхід залишено таким, як його замовляв власник. Це власний OTP-процес через бота, а не кнопка Telegram OAuth, але залежність від іншого застосунку потребує перевірки. Не обіцяти прийняття Apple. Не додавати альтернативний вхід без рішення власника.
3. Підготувати контрольований обліковий запис для рев’ю Apple і точну інструкцію входу. Не публікувати його дані у GitHub. Не додавати прихований універсальний код, тестовий обхід авторизації або недокументований деморежим. Не відправляти OTP реальним клієнтам для перевірки.
4. Додати повні відомості власника/оператора персональних даних, контакт щодо приватності, цілі та строки зберігання/видалення CRM-даних, умови сторонніх постачальників і права користувача до фінальної політики. Опублікувати стабільні загальнодоступні HTTPS-адреси підтримки та політики й внести їх у `metadata.uk.json`. `public/privacy.html` зараз пояснює технічну реалізацію; власник має завершити політику перед випуском.
5. Узгодити видалення акаунта й даних. Нині в застосунку немає самостійної реєстрації клієнта: він входить у наявний CRM-профіль. Вихід або приховування авто НЕ є видаленням акаунта. Перевірити, чи прив’язка Telegram утворює акаунт у розумінні Apple. Якщо правило 5.1.1(v) застосовується, до подачі реалізувати запуск видалення в застосунку з коректним очищенням прив’язки, сесій та даних; одного телефонного звернення недостатньо. Для історії ремонтів окремо визначити, які записи мають залишатися за законом. Не видаляти CRM-історію без цього рішення.
6. Завершити App Privacy в App Store Connect. За кодом використовуються телефон, Telegram/CRM-ідентифікатори, VIN/дані автомобіля та текст звернень. Окремо перевірити обробку імен, історії покупок/ремонтів, технічних логів та постачальників. Усі відповідні категорії — для роботи застосунку, пов’язані з користувачем; не заявляти «Data Not Collected». Privacy manifest не замінює цю анкету.
7. Зробити фінальні скриншоти на відповідному iPhone/симуляторі з тестовими даними, заповнити актуальну анкету вікового рейтингу, підтвердити права на бренд/логотипи автомобілів і перевірити доступність назви. Знімок екрана входу з CI — лише перевірка запуску, не повний комплект для магазину.

## Наступний етап: TestFlight

Обліковий запис і картка вже є. Наступні дії: налаштувати підпис, виконати `iOS TestFlight`, дочекатися обробки збірки Apple й увімкнути внутрішнє тестування для власника. Після встановлення через TestFlight пройти реальний сценарій на iPhone. Подача на App Review — після завершення матеріалів і пунктів вище. Автоматичний workflow завантажує збірку, але не подає на App Review і не публікує її.

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
