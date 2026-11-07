# Data flow & permission inventory methodology

Turn static evidence (manifest permissions, endpoint strings, serialized model
field names, SDK list) and best-effort dynamic evidence (captured bodies) into a
bidirectional data-flow inventory, then infer the backend HLD from it.

Goal: know (1) what the client captures and sends upstream, (2) what the server
sends back, and (3) which server systems those flows imply — even without
knowing the implementation.

## 1. Permissions → data captured (upstream source)

Android manifest permissions reveal what the client _can_ read. Map each
dangerous permission to the data category it unlocks and the likely server
purpose. Common mapping:

| Permission                    | Data unlocked          | Likely server purpose                        |
| ----------------------------- | ---------------------- | -------------------------------------------- |
| `ACCESS_FINE/COARSE_LOCATION` | GPS / network location | serviceability, nearest dark store, ETA      |
| `READ_CONTACTS`               | contact list           | invite/referral, address-book matching       |
| `CAMERA`                      | image / scan           | barcode scan, document / KYC upload          |
| `RECORD_AUDIO`                | microphone             | voice search, support                        |
| `READ_EXTERNAL_STORAGE`       | files / media          | uploads, cache                               |
| `READ_PHONE_STATE`            | device / telephony IDs | device fingerprinting, fraud                 |
| `GET_ACCOUNTS`                | account list           | SSO account picker                           |
| `READ/RECEIVE_SMS`            | SMS inbox              | OTP auto-read (login), transaction detection |
| `POST_NOTIFICATIONS`          | notification delivery  | push / MQTT                                  |

Report which are actually requested (manifest) versus used (evidence in
code/strings), and cross-check against the endpoint/schema inventory below.

## 2. Client → Server (what's sent, and how much)

Enumerate the upstream flow from two sources:

1. **Request fields.** For each endpoint, list the serialized request field
   names (readable even under R8 — serialized names are preserved for wire
   compatibility). Auth tokens, device/identity, location, cart/order, and
   telemetry are the usual categories.
2. **Telemetry / SDK.** AppsFlyer, Firebase, and first-party
   `*.analytics.consumer.*` events capture impression/click/scroll/session
   events with structural parent-child attribution.

### Volume / history signals

"How much history is transferred" can only be _inferred_, never directly
observed (mark `[inf]`). Signals:

- **Pagination** — `page` / `offset` / `limit` / `cursor` / `next` params, and
  the page size, reveal how much of a list the client requests per call.
- **Sync / delta** — `since`, `updated_after`, `sync`, `last_synced_at` params
  indicate incremental pull vs full refresh.
- **History depth** — e.g. `order_history` list length / page size bounds how
  much past data the client pulls by default.
- **Batch endpoints** — a single call returning many records implies a bulk
  upstream or downstream path.

## 3. Server → Client (the main information flown)

Enumerate the downstream flow. The serialized _response_ field names are the
schema. Categorize each payload by the "main information" it carries:

- widget tree / layout (server-driven UI)
- catalog & inventory / availability
- pricing / promotions / delivery charges
- ETA / serviceability
- recommendations / personalized rails
- order status / tracking
- user profile / auth state

This inventory _is_ the "what the app knows about the backend" answer: the more
of the product that arrives as data (rather than hardcoded client logic), the
more the backend owns.

## 4. Infer the HLD from the flows

Cluster the bidirectional flows into systems. Rule of thumb — a distinct,
coherent set of fields/endpoints that share a domain usually maps to one backend
service (or one service + store):

| Flow cluster                             | Implied system                   |
| ---------------------------------------- | -------------------------------- |
| auth token issuance, profile, account    | Identity / accounts (often SSO)  |
| product details, categories, groupings   | Catalog                          |
| inventory, availability, OOS substitutes | Inventory / availability         |
| price, coupons, delivery charge          | Pricing / promotions             |
| per-asset ETA, serviceability            | ETA / logistics prediction       |
| ranked rails, personalized cards         | Recommendation / personalization |
| search suggest + results                 | Search                           |
| cart, order place, status machine        | Order / logistics                |
| payments (SDK)                           | Payments (often external/shared) |
| chat, MQTT push                          | Messaging / realtime             |
| widget/telemetry events                  | Analytics / data pipeline        |
| media / assets                           | CDN / static content             |

Mark each inferred system `[der]` (logically follows from the flows) or `[inf]`
(plausible, unconfirmed), never `[obs]` unless you saw it in code directly.

## 5. Evidence discipline

- Request/response **field names** = `[obs]` (directly read).
- Permission → data category = `[obs]` for the mapping, `[der]` for the "likely
  purpose".
- Volume/history = `[inf]` (server retention is never observable from the
  client).
- HLD system decomposition = `[der]`/`[inf]` per the rubric above.
