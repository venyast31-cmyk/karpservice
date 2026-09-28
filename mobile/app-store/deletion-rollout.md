# Account deletion rollout — 28 September 2026

## Verified state

- Owner approved manual fulfillment within seven calendar days and indefinite history retention until requested deletion.
- Production API deployment succeeded: GitHub run 36353404777, attempt 2, Worker version df9772c9-f946-4d35-9eca-af6c84f44702. Migrations 0002 and 0003 applied; ACCOUNT_DELETION_DAYS=7. AUTH_DB binding retained.
- iOS 7.1.0 uploaded successfully in run 36353757661 and selected/saved in App Store Connect. It includes the deletion UI.
- On 28 September, the deletion integration test was changed to exercise the complete Worker request router with a fictional authenticated session and in-memory SQL database. It verifies unauthorized access, disabled configuration, confirmation, identity spoofing rejection, notification failure/retry, stable request ID and preservation of sessions while deletion is pending.
- Five UI behavior tests execute the shipped native module with platform/DOM substitutes: cancel, confirm/pending, delivery failure/retry, demo isolation and logout during policy fetch. All 15 mobile tests and four backend tests pass; bundled app checks pass.
- Public and bundled privacy/support texts now explain the in-app request, seven-day deadline, manual fulfillment, pending status, demo isolation and service Telegram notification data.

## Remaining verification and release gates

- These automated checks use a mocked Telegram response. Actual Telegram delivery of a deletion request has NOT been tested. No production customer request, deletion, booking or notification was initiated during QA.
- A full operator fulfillment rehearsal and on-device confirmation of the new deletion screen remain unverified. Do not label automated tests as actual erasure of CRM data.
- Updated bundled privacy/support text requires a replacement build after 7.1.0. Track its CI upload and App Store Connect selection separately.
- Apple case 102977968533 requested prior approval for demo review access; no approval recorded. App Review submission and public release have not occurred.

## Manual fulfillment

The in-app request identifies the customer from the verified session and includes the entire profile and related data, not only the Telegram login. A request persists in AUTH_DB and is sent to the existing service Telegram chat. Delivery failures are shown to the customer; retrying uses the same ID. Staff must monitor the queue and meet the approved deadline.

For each verified request:

1. Locate the request by its ID in `deletion_requests`. Confirm the customer/phone identity against the CRM. Do not act on an arbitrary customer ID supplied in a message from an unverified source.
2. Remove or anonymize the customer's CRM profile, vehicles, history, bookings, notes and related personal data using the CRM's supported deletion process. If records must legally remain, record the precise scope and reason and tell the customer. Check applicable backup/provider retention.
3. Revoke **all** of that customer's sessions and delete their `telegram_links`, `link_requests`, `otp_challenges`, and `hidden_customer_cars` records. Use verified customer ID/phone and parameterized queries. Do not delete another customer's shared or transferred vehicle history.
4. Confirm completion to the customer at their verified phone/Telegram contact, including any specific lawful-retention exception. This notification is an operator action, not an automated message sent during this preparation.
5. Remove the completed pending request's personal data and service notification; retain only whatever minimal evidence is justified by the operator's documented obligations. Never label a request complete just because it was received.

Do not enable the feature until the operator can perform this complete procedure.
