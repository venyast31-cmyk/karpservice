# Account deletion rollout — prepared, not deployed

The owner confirmed on 2026-09-27 that history is retained indefinitely and deleted on a customer's request. The owner explicitly confirmed a seven-calendar-day completion deadline and authorized rollout on 2026-09-27. `ACCOUNT_DELETION_DAYS=7` is now prepared in configuration. The native UI and isolated demo request are integrated in source, but not uploaded as a device build. Server deployment remains blocked by unavailable authenticated Cloudflare access.

## Rollout gates

1. Deadline confirmed: seven calendar days. Requests are sent to the existing service Telegram chat.
2. Obtain normal Cloudflare access; do not bypass the dashboard's browser-verification block or create credentials without approval.
3. Apply `worker/migrations/0003_deletion_requests.sql` to the existing AUTH_DB, configure `ACCOUNT_DELETION_DAYS`, and deploy the Worker. Keep existing secrets and database binding. No customer rows are deleted by this migration.
4. Verify configuration and a request against a dedicated fictional staging profile, never a real customer's profile. Confirm failures show errors and duplicate submissions retain their request number. The current automated tests mock all Telegram sends.
5. After successful backend rollout, publish policy text describing Profile → Delete profile and data and the confirmed seven-calendar-day completion deadline. Retention remains indefinite until requested deletion; do not claim that accepting a request instantly erases data.
6. Build/upload a new iOS version with the integrated UI; build 6.1.0 does not contain this feature. Validate the profile button, confirmation, status and demo isolation before App Review.

## Operator completion procedure

## Deployment access via GitHub Actions

The prepared `.github/workflows/api-deploy.yml` runs only on an explicit push to `release/api`. It does not run on this preparation branch. It checks source and isolated tests, applies additive migrations, deploys the existing Worker, and checks public health. A successful health check alone does not verify customer deletion delivery.

The owner must store `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the repository's Actions secrets, never in chat, source, or workflow inputs. Restrict the token to the relevant Cloudflare account, with Workers Scripts Edit for deployment and D1 Edit for migration; avoid unrelated permissions. Use a short expiry suitable for the release. Do not create or expand a token on the owner's behalf without authorization.

After the secrets are provided, an explicitly authorized release branch push can run the prepared workflow. Existing Worker secrets and bindings are retained; the workflow does not send Telegram messages or initiate customer deletion requests. Continue rollout gates above before uploading the next native build.

## Manual fulfillment

The in-app request identifies the customer from the verified session and includes the entire profile and related data, not only the Telegram login. A request persists in AUTH_DB and is sent to the existing service Telegram chat. Delivery failures are shown to the customer; retrying uses the same ID. Staff must monitor the queue and meet the approved deadline.

For each verified request:

1. Locate the request by its ID in `deletion_requests`. Confirm the customer/phone identity against the CRM. Do not act on an arbitrary customer ID supplied in a message from an unverified source.
2. Remove or anonymize the customer's CRM profile, vehicles, history, bookings, notes and related personal data using the CRM's supported deletion process. If records must legally remain, record the precise scope and reason and tell the customer. Check applicable backup/provider retention.
3. Revoke **all** of that customer's sessions and delete their `telegram_links`, `link_requests`, `otp_challenges`, and `hidden_customer_cars` records. Use verified customer ID/phone and parameterized queries. Do not delete another customer's shared or transferred vehicle history.
4. Confirm completion to the customer at their verified phone/Telegram contact, including any specific lawful-retention exception. This notification is an operator action, not an automated message sent during this preparation.
5. Remove the completed pending request's personal data and service notification; retain only whatever minimal evidence is justified by the operator's documented obligations. Never label a request complete just because it was received.

Do not enable the feature until the operator can perform this complete procedure.
