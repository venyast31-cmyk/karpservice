# Karpservice owner analytics

GET /admin/analytics serves a responsive owner dashboard. GET /admin/analytics/data?days=7|30|90 requires a dedicated random bearer key; only its SHA-256 digest is configured as ANALYTICS_ADMIN_TOKEN_SHA256. There is no public customer-data endpoint, URL token, shared CRM secret, browser persistent storage or third-party tracker.

Server-side metrics begin when migration 0008 is applied. Existing account counts are a current snapshot, not download counts. Apple successful authorization, new Apple account, first verified phone link, successful profile load (daily active account), and CRM-verified booking are counted. Review-account routes return before instrumentation. Profile loads do not measure all app launches. Daily active counts must not be summed as period-unique users. Registration/link/booking totals are not a cohort conversion funnel.

Rows retain only a day, event name, count and event/day-specific HMAC. No raw names, phones, emails, Apple subjects, VINs, IPs or tokens are stored in analytics. Activity and verified booking retries within the day deduplicate. Old rows are removed on subsequent writes after 93 days. Recording failures are caught independently from customer operations; logs contain only analytics_write_failed. Dashboard response and page are no-store and noindex.

App Store downloads are intentionally null until a real App Store Connect source is integrated. The dashboard links to Apple and labels this absence. It never substitutes account counts for downloads or invents historical usage. All dates use Europe/Kyiv.

Key rotation: generate >=32 bytes of random URL-safe text, replace the SHA-256 digest in the Worker configuration and deploy. Deliver the raw key privately to the owner, never commit it or put it in query parameters.

Verification: npm --prefix worker run check && npm --prefix worker test.
