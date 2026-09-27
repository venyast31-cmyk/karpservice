# Хмарна збірка Karpservice для TestFlight

Зареєстровано: Apple Team `L6W4586456`, Bundle ID `ua.karpservice.client`, назва `Karpservice`, SKU `karpservice-ios`, версія `1.0`.

## Одноразове підключення

У GitHub → `venyast31-cmyk/karpservice` → Settings → Secrets and variables → Actions необхідно додати:

| Secret | Значення |
| --- | --- |
| `IOS_DISTRIBUTION_P12_BASE64` | Base64 файла `.p12` з Apple Distribution сертифікатом і його приватним ключем. |
| `IOS_DISTRIBUTION_P12_PASSWORD` | Пароль цього `.p12`. |
| `IOS_PROVISION_PROFILE_BASE64` | Base64 профілю App Store Connect для цього Bundle ID і сертифіката. |
| `ASC_PRIVATE_KEY` | Повний PEM-вміст `.p8` ключа App Store Connect, включно з BEGIN/END PRIVATE KEY. |
| `ASC_KEY_ID` | Key ID ключа. |
| `ASC_ISSUER_ID` | Issuer ID команди. |

Для автоматизації керування сертифікатами та профілями потрібен team API key з відповідними правами Admin. Якщо сертифікат/профіль уже створені, для завантаження можна використати окремий ключ з мінімальними достатніми правами. Ключ створюється в App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys. Запит доступу до API та угоди, якщо Apple їх показує, завершує власник.

Приватні ключі, пароль `.p12`, коди входу та дані рев’юера не додаються до репозиторію, коментарів, журналів або звичайних workflow inputs. Пароль Apple Account у CI не використовується. Сертифікат без відповідного приватного ключа не придатний для підписання.

## Запуск

1. Дочекатися успіху `iOS preparation` на потрібному коміті. Цей workflow перевіряє код, симулятор і компіляцію для iPhone без секретів.
2. Після підключення секретів створити або оновити окрему гілку `release/ios-testflight` до перевіреного коміту. Саме цей push запускає підписання та завантаження. Якщо workflow уже є в основній гілці, його також можна запустити вручну на `main` або `release/ios-testflight`.
3. `iOS TestFlight` перевірить профіль/команду/сертифікат, збере Release-архів, перевірить підпис і відправить у наявну картку App Store Connect. Номер збірки має формат `run_number.run_attempt.0`.
4. Дочекатися обробки Apple. У App Store Connect → Karpservice → TestFlight додати збірку до групи внутрішнього тестування та обліковий запис власника як тестувальника.
5. Встановити через TestFlight і перевірити вхід, відновлення сесії, Telegram, авто, історію, запис і нагадування на фізичному iPhone.

Завантаження в TestFlight не дорівнює публікації. Workflow не надсилає застосунок на App Review, не приймає угод і не додає тестувальників автоматично. Незавершені матеріали та вимоги для публічної версії наведені в `RELEASE.md`.

## Безпека та діагностика

- Тимчасова в’язка ключів видаляється кроком `always()`. Публічні artifacts не містять підписувальних секретів, `.p12`, `.p8` чи профілю.
- У разі жорсткого переривання GitHub видаляє одноразовий hosted runner; сертифікати в Apple не відкликаються автоматично.
- Відсутні чи некоректні секрети зупиняють роботу до архівування. Невідповідна команда, інший Bundle ID або сертифікат без приватного ключа також блокують збірку.
- У разі відмови Apple перевірити угоди, роль ключа, строк дії сертифіката/профілю та доступність наявної картки. Успішна компіляція без підпису не доводить можливість завантаження.

## Офіційні джерела

- https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/
- https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- https://developer.apple.com/videos/play/wwdc2021/10204/
- https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications
