# Pending user-requested updates

Preparation only. Collect the remaining changes before uploading to TestFlight.
App Store submission requires the user's later explicit instruction.

- Prevent accidental double-tap zoom in the bundled iOS interface.
- Edit the app profile name with save/cancel and server persistence.

Before TestFlight upload, apply the profile backend changes to the latest
`release/api` branch (preserve its newer analytics work), including migration
`0008_profile_name.sql`, and deploy the API with its migration workflow.
The iOS bundle now requires `POST /account/name`. Name edits apply to the
Apple-backed app profile; CRM contact names remain managed by the service.

Validation: mobile check passes (24 tests); Worker tests pass (18 tests).
The name integration test covers persistence across login/CRM name refresh,
input validation, expired sessions and isolation between Apple accounts.
Verify double-tap, scrolling, editing, cancellation, save errors and name
persistence on the user's iPhone in TestFlight before App Store submission.
