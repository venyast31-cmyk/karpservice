# Pending user-requested updates

Preparation only. Collect the remaining changes before uploading to TestFlight.
App Store submission requires the user's later explicit instruction.

- Prevent accidental double-tap zoom in the bundled iOS interface.
- Tap the client row to open profile details; open separate name, phone and birth-date dialogs.
- Persist name and optional birth date on the Apple-backed app profile.
- Verify phone changes through account-bound Telegram OTP before saving. Preserve the existing CRM customer ID, cars and history; reject a number associated with another CRM contact or Apple account.

Before TestFlight upload, apply the profile backend changes to the latest
`release/api` branch (preserve its newer analytics work), including migration
`0008_profile_name.sql`, `0009_profile_birth_date.sql` and `0010_unique_verified_phone.sql`, and deploy the API with its migration workflow.
The iOS bundle now requires `POST /account/name` and `POST /account/birth-date`. Name edits apply to the
Apple-backed app profile; CRM contact names, phone fields and birthdays remain managed by the service; these edits update the app profile and verified app phone.

Validation: mobile check passes (24 tests); Worker tests pass (20 tests).
The name integration test covers persistence across login/CRM name refresh,
input validation, expired sessions and isolation between Apple accounts.
Birth-date and phone-change integration tests cover calendar validation, persistence, account-bound OTP, number conflicts and retained CRM ownership.
A separate DOM interaction check passed opening, saving, cancellation, errors, phone-flow restoration and logout reset. Browser rendering could not run because the browser binary download failed; visual iPhone review is still required.
Verify double-tap, scrolling, editing, cancellation, save errors and name
persistence on the user's iPhone in TestFlight before App Store submission.
