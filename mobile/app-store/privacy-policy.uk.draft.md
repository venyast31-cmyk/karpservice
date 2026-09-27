# Рішення щодо політики приватності — 27 вересня 2026

Власник підтвердив:
- Оператор — **ФОП Карпенко Євгеній Ігорович**.
- Історія клієнтів зберігається постійно; видалення виконується на запит клієнта.
- Публічний контакт сервісу: 073 44 47 344, Бориспіль, Київський Шлях, 10.

На цій основі остаточний текст підготовлено у `mobile/public/privacy.html` та `privacy/index.html`. Текст описує реальну ручну обробку запитів, не обіцяє автоматичне очищення CRM або вже наявну кнопку видалення профілю.

Залишок перед App Review: узгодити доступ Apple до повного функціоналу. Правило 2.1(a) вимагає попереднього погодження Apple для деморежиму замість тестового облікового запису. Вимогу щодо ініціювання видалення всередині застосунку слід вирішити для автоматично створюваної Telegram-прив’язки; її не замінює саме лише телефонне звернення. Не подавати неоднозначну декларацію про наявність такої функції.


Update 2026-09-27 22:52: demo mode was removed on explicit owner instruction. Demo approval is no longer sought. A real reviewer access arrangement and in-app deletion rollout remain prerequisites.


## Update 2026-09-27 23:11 Europe/Kyiv — public demo restored

The owner now explicitly requests a public demo without Telegram login, superseding the removal instruction above. Restored the tested local demo from 934359e: visible entry, fictional cars and history, isolated trial bookings, a clear demo banner and exit. Live login and production access controls are unchanged. Build 5.1.0 remains selected in Apple until the replacement is uploaded and processed. No App Review submission or public release has occurred. Prior Apple approval for using demo instead of a reviewer account is still pending; no approval request has been sent. The prepared deletion backend and unapplied UI patch remain unchanged and are not deployed.
