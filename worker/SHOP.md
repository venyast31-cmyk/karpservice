# Karpservice shop

The native app uses `/shop/categories`, `/shop/products`, `/shop/checkout`, and
`/shop/orders`. Catalog browsing is public and rate limited. Ordering and order
history require the existing authenticated, phone-linked customer session.

Supplier calls only read BM Parts data. Only the four warehouse IDs and four
catalog roots and their curated subgroups in `src/shop-catalog.js` are browsable.
Every subgroup has a supplier or representative product photo. Under the wiper
system only blades are offered; arms and mechanisms are excluded. Warehouse
names are retained in CRM notes but omitted from public product responses. The
app chooses the earliest delivery with enough stock and displays only availability
and delivery timing. Customer prices are purchase prices
multiplied by 1.30 and rounded to kopecks on the server. Checkout reloads the
selected products and rejects changed prices, unavailable stock and invalid pack
quantities. The app never places supplier orders or takes payment.

## Credentials

The supplier token is encrypted with AES-GCM under a dedicated HKDF key derived
from the existing SESSION_SECRET. Its encrypted envelope is stored in D1
`integration_secrets`, name `busmarket`. This overrides the legacy
BUSMARKET_API_TOKEN binding, whose saved value failed supplier authentication.
Never log, return or put the plaintext token in source control. Coordinate any
SESSION_SECRET rotation with re-encryption of this credential and Apple tokens.
The expiring setup endpoint used during installation has been removed.

## CRM

Verified against the company roster on 2026-10-13 (Kyiv):
- Артем: 257253
- Євгеній: 213733
- Location: 136446
- Existing paid order type: 225857, `Платний`

One of the two verified managers is assigned to each new order. CRM permits a
single manager field. The order description identifies the shop. Manager notes
contain the immutable shop request UUID, items, articles, brands, quantities,
retail prices, warehouses, expected delivery text, selected vehicle/VIN and
customer comment. `estimated_price` contains the total. Managers manually
confirm and add inventory line items as needed; supplier stock is not CRM stock.
No appointment times or workshop resources are reserved for shop orders.

## Duplicate and uncertain submissions

The app persists a request UUID before submission. D1 atomically claims the
(customer_id, request_key) pair before the single CRM POST. Retrying that UUID
never issues another CRM write. Do not automatically retry uncertain POSTs.

If the supplier fails or prices change, no CRM order is submitted. If the CRM
response or final D1 update is uncertain, the app retains the UUID, shows that
verification is needed and provides the service telephone number. The customer
can also see the request in My Orders.

To reconcile a `sending` or `verification` row, search CRM manager notes for its
public_id. If found, record that CRM ID and mark the D1 row sent. Otherwise,
confirm with the manager before creating anything manually. The snapshot is
stored in shop_orders for this process. Include these rows in customer deletion
handling, as specified in the deletion notification.

## Validation

Worker tests cover price calculation, warehouse filtering, Kyiv cutoff times,
weekend fallback, identity ownership, stale price/stock rejection, and repeated
or uncertain checkout submissions. Review accounts have an isolated fictional
shop and never reach BM Parts or CRM. No real customer order was created during
these tests.
