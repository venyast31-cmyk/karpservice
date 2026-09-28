# Password-protected review account

Owner authorized phone +380734447344 as a test login on 2026-09-28.
The password account has separate D1 identity, sessions and fictional data. It never resolves this phone through CRM or Telegram and cannot access the owner's existing profile.

Login: on the iPhone login screen enter the phone, expand **Вхід до тестового акаунта**, enter the separately supplied password, tap **Увійти з паролем**.
The password is random and not included in source control. Only a salted PBKDF2 verifier is seeded in D1. Tokens are stored in iOS Keychain. Login is rate-limited by IP and phone.

Cars, history, bookings and car hiding are stored on the server and survive sign-out. No real workshop appointment or Telegram message is generated. The banner identifies the test account. Native reminders/share remain available.

Deletion removes this isolated account, its verifier, data and all sessions immediately. Reviewers should test deletion last; re-provisioning requires an operator. It does not delete or modify the owner's real phone profile. Normal customer deletion remains the seven-day operator process.

Deployment and successful end-to-end login must be verified before submitting review credentials. This account is not represented as Apple's prior approval of demo mode.
