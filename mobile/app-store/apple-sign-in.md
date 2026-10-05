# Sign in with Apple — release preparation, 5 October 2026

Owner approved implementation after the App Review 4.8 rejection of version 1.0 (10.1.0), submission 09285e2e-7abf-47ce-8cb7-6020fb514922. No replacement build has been uploaded or submitted yet.

## Implemented

Native AuthenticationServices authorization and official localized button artwork; identity tokens/codes stay out of JavaScript. Server verification uses Apple's public keys, a one-use nonce/state challenge, code exchange and encrypted refresh tokens. Apple login needs no phone or Telegram and accepts Apple's relay email. A new Apple account starts with an empty garage. The first valid vehicle addition creates a separate CRM person; identities are never merged by email, name or VIN. A recently authenticated existing customer can link Apple from Profile. Account deletion revokes Apple authorization. Guest browsing and the isolated review account remain available.

## Required before release

1. Completed after owner reauthentication on 5 October: enabled Sign in with Apple as the primary App ID for `ua.karpservice.client`, resource `Z2JHAYZ2H3`, team `L6W4586456`; saved successfully. Apple warned that existing provisioning profiles need regeneration.
2. Completed: registered dedicated key `Karpservice Sign in with Apple`, ID `97FB785AR6`, scoped only to this primary App ID and service. Apple displays it as downloaded, but the browser download timed out and returned no file path. No private-key contents were recovered. Do not create another key blindly. The owner must locate their downloaded `.p8` and add its contents to the GitHub Actions repository secret `APPLE_SIGN_IN_PRIVATE_KEY`. The release workflow validates a P-256 PEM and sends only the two Apple bindings to Cloudflare Worker `karpservice-api` (account `0feb0b23b311ee71074cc7a19d30ae2c`) through stdin, with child output suppressed. Key ID defaults to `97FB785AR6`; `APPLE_SIGN_IN_KEY_ID` may override it for an explicitly authorized rotation. Never commit the .p8 file, print it, or include it in an artifact. The App Store Connect API key is a different credential and must not be reused.
3. Merge the tested commit into `release/api`; migrations are additive. Verify `/health` has `apple_signin_configured: true`, and existing login remains healthy. Wranger preserves the existing Worker secrets.
4. Signed CI reads Apple capabilities, reuses a valid profile or regenerates it with the existing distribution certificate. It never changes capabilities or creates/revokes certificates. The existing ASC API key must have Certificates, Identifiers & Profiles access. The profile and signed app must contain `com.apple.developer.applesignin = [Default]`.
5. Push the verified commit into `release/ios-testflight`. Inspect upload success and wait for processing. Assign the new build to the internal `Тест Karpservice` group; future builds are not automatically assigned.
6. On an iPhone, test new Apple login with Hide My Email, logout/re-login, new vehicle addition, optional linking from a known test Telegram profile, and deleting a disposable Apple profile. Do not claim a live Apple login test based on token mocks or compilation.
7. Publish `privacy/index.html` on the website's main branch. Update App Privacy to include Email Address (App Functionality, Linked to User, No Tracking); Name/User ID already exist. Update the description and login screenshot. Other screenshot content uses the public fictional demo and must be described as such.
8. Select the new build in version 1.0; preserve private reviewer credentials. Explain Apple login and account deletion in Review Notes. Reply to the current 4.8 rejection and submit. Verify actual Waiting for Review/In Review status before reporting submission.

## Review reply draft — send only after the above is verified

We added native Sign in with Apple as an equivalent login option. On the public home screen, open Profile and choose Sign in with Apple. This option requests only name and email, supports Hide My Email, and does not require a phone number or Telegram. The app does not use advertising tracking. New Apple users can access their own profile, add a vehicle, and book workshop services. Existing customers may optionally link Apple to their existing account after authenticating that account; this is not required for a new Apple login.

We updated the App Store description, privacy disclosures and screenshots to show the new login option. Account deletion is available in Profile → Delete profile and data and revokes Apple authorization. The private review account remains available for inspecting populated fictional repair history. Public news, services and contact information remain accessible without signing in.

## Validation

- Local mobile tests and worker tests passed, including JWT tampering/replay, hidden-email separation, linking authorization, CRM ownership, deletion/revocation and invalid VIN handling.
- Initial native implementation compiled successfully for iPhone and simulator in iOS preparation run 37298796854. The updated implementation compiled in run 37300677047; all 13 worker tests and mobile checks passed.
- The login screenshot from run 37300677047 was visually verified: the native button reads "Вхід з Apple" and the ordinary Telegram, review-account and demo options remain present. That run failed the screenshot OCR check because it expected an English/incorrect Ukrainian phrase. The localized checker, all verification jobs, iPhone compilation, simulator launch and App Store screenshot capture passed in run 37305812982 at commit d84dc239cdf14b1a6a25bf06f9b4f74a997f2b29.
- Apple capability and key registration are complete. Private-key installation, live Apple authorization, signed replacement build and re-submission remain unverified and pending.
