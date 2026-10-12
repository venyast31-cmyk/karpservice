# Pending user-requested updates

TestFlight upload authorized by the user on 2026-10-12. API changes and migrations 0008–0011 deployed successfully, preserving analytics (commit c0fb26f).
Version 1.0 train was closed by Apple; upload version 1.0.1.
App Store submission requires the user's later explicit instruction.

- Prevent accidental double-tap zoom in the bundled iOS interface.
- On News, show «Новини» beside the top logo and remove the duplicate heading below. Other screens keep Karpservice.
- Add the eight user-approved transparent emblem previews: Mercedes-Benz, Ford, Land Rover, BMW, Audi, Volkswagen, Toyota, Škoda. Each card displays its matching sprite region on the existing dark card, without a white tile; all other catalogued makes now use the existing matching brand assets (69 makes total). Four opaque originals use a luminance-to-alpha SVG filter for a white emblem on transparent surroundings; dark monochrome logos are lightened for dark cards. Only unknown makes retain the neutral fallback. User explicitly approved these assets on 2026-10-12. This records visual approval, not a trademark license.
- Remove per-car booking buttons from the Cars tab; central booking remains.
- Show editable mileage under VIN, using the latest available recorded reading until the customer saves an app-specific value. Saves validate current ownership and persist by customer ID and VIN (asset ID fallback). CRM order readings remain unchanged.
- Replace the generic oil-promotion panel with the exact customer-supplied banner. The original JPEG is bundled unmodified; an SVG viewport displays only its banner region, avoiding duplicate screenshot navigation.
- Tap the client row to open profile details; open separate name, phone and birth-date dialogs.
- Persist name and optional birth date on the Apple-backed app profile.
- Verify phone changes through account-bound Telegram OTP before saving. Preserve the existing CRM customer ID, cars and history; reject a number associated with another CRM contact or Apple account.

Before TestFlight upload, apply the profile backend changes to the latest
`release/api` branch (preserve its newer analytics work), including migration
`0008_profile_name.sql`, `0009_profile_birth_date.sql` `0010_unique_verified_phone.sql` and `0011_car_mileage.sql`, and deploy the API with its migration workflow.
The iOS bundle now requires `POST /account/name`, `POST /account/birth-date` and `POST /cars/mileage`. Name edits apply to the
Apple-backed app profile; CRM contact names, phone fields and birthdays remain managed by the service; these edits update the app profile and verified app phone.

Validation: mobile check passes (24 tests); Worker tests pass (22 tests).
The name integration test covers persistence across login/CRM name refresh,
input validation, expired sessions and isolation between Apple accounts.
Mileage tests cover ownership, unknown versus zero, latest recorded reading, hidden vehicles, validation, cross-customer isolation and persistence after login. A DOM check of the real car renderer and mileage dialog covers removal of booking buttons, save/cancel, failed saves and logout.
Birth-date and phone-change integration tests cover calendar validation, persistence, account-bound OTP, number conflicts and retained CRM ownership.
A separate DOM interaction check passed opening, saving, cancellation, errors, phone-flow restoration and logout reset. Browser rendering could not run because the browser binary download failed; visual iPhone review is still required.
Verify double-tap, scrolling, editing, cancellation, save errors and name
persistence on the user's iPhone in TestFlight before App Store submission.
