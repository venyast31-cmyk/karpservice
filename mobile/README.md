# Karpservice for iPhone

The iOS app bundles the existing Ukrainian frontend with Capacitor 8.5.2. It uses the existing production API and keeps the seven-day session in iOS Keychain, with no token returned to JavaScript. There is no remote `server.url` and no new Apple account or paid service is needed to prepare the source or build for a simulator.

## Development

Requirements: Node 24, macOS with Xcode 26 or newer and its iOS simulator SDK.

```sh
cd mobile
npm ci
npm run check
npm run sync
npm run open
```

Select the **App** scheme and an iPhone simulator in Xcode. The bundle identifier is provisionally `ua.karpservice.client`; register/confirm it when the owner's Apple team is available. The app targets iOS 15+ and iPhone, portrait orientation. The Xcode project is `ios/App/App.xcodeproj` and uses Swift Package Manager, not CocoaPods.

The GitHub workflow `iOS preparation` builds and launches a simulator app with local ad-hoc signing and exports logs, a ZIP and a login-screen capture. Local signing preserves the Keychain entitlements; disabling signing entirely breaks secure storage in Simulator. Its artifact **cannot be installed on a physical iPhone or uploaded to App Store Connect**. The workflow does not require an Apple account or signing secrets and does not deploy the web frontend or API.

## What is implemented

- Existing News, Cars, Booking, History and Profile screens and Telegram-only verification.
- A native API bridge with a fixed HTTPS host and allowed route/method list. Tokens are saved with `WhenUnlockedThisDeviceOnly`, expire within seven days, are removed locally on logout, and are never exposed to the frontend. Redirects and arbitrary destinations are rejected. Private responses are not written to a URL cache.
- iOS local reminders, requested only after the user taps the reminder button after a successful booking. An hour's notice is preferred; near-term bookings use fifteen minutes. The profile can cancel all reminders. Logout also cancels them. Reminders are device-local and do not automatically track later CRM rescheduling; the UI explains this.
- Native share sheet for appointment details, haptics, support/Maps links, an offline notice and a manual data refresh.
- Local support and privacy information, Ukrainian localization, branded icon/launch screen and a privacy manifest.

## Release work that remains before Apple submission

See `app-store/RELEASE.md`. In particular, do not claim App Store readiness before physical-device login testing, final owner/privacy information, reviewer access and the Telegram-only review assessment are complete. The in-app privacy explanation is a technical draft, not a completed legal privacy policy. No production customer data, test bypass, signing key or Apple credential belongs in this repository.

The existing web version remains the source of shared screens; `scripts/build.mjs` adds mobile UI and replaces the browser token-handling block only in the bundled build. It fails if the source insertion points drift. The shared frontend hooks are inactive outside iOS. The Cloudflare edge's cookie-based login normalization remains covered by the existing tests.

## Tests

`npm run check` checks the transport boundary, reminders, bundled HTML/asset integrity and Xcode references. `npm --prefix ../worker test` runs the existing backend authorization and session regression suite. Neither simulates a real Telegram verification or writes to the production CRM.
