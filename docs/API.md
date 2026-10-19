# Pace IT — API Reference

The server exposes a JSON-over-HTTP API under **`/api`**. The React app is its only normal client, but every call below can be made with `curl`, Postman, etc.

- Source of truth: `server/api.ts` (routes), `server/db.ts` (what each route does), `server.ts` (body limits).
- Base URL (default): `http://localhost:3000/api`

---

## 1. Conventions

### 1.1 Authentication
Login sets an **HttpOnly cookie** named `pace_it_session` (SameSite=Lax, path `/`, 30 days; `Secure` when the server runs HTTPS or `COOKIE_SECURE=1`). **The token is only accepted from this cookie** — there is no `Authorization` header.

With curl, keep a cookie jar:

```bash
curl -c jar.txt -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}' \
  http://localhost:3000/api/auth/login

curl -b jar.txt http://localhost:3000/api/logs
```

Legend used in the tables below:

| Mark | Meaning |
|---|---|
| 🌐 | Public — no login needed |
| 🔑 | Any logged-in user |
| 🛡️ | Admin only |

### 1.2 Request & response format
- Request bodies are JSON (`Content-Type: application/json`).
- Success responses are JSON (except file downloads and the event stream).
- **Every error** is JSON: `{ "error": "Human-readable message" }`.

### 1.3 Status codes you'll meet
| Code | When |
|---|---|
| 200 | Success (the API uses 200 for creates too) |
| 304 | `GET /logs` with a matching `If-None-Match` |
| 400 | Missing/invalid input, or a rule was broken (message explains) |
| 401 | Not logged in, session expired, or account disabled |
| 403 | Not an admin, wrong admin password, or disabled account at login |
| 404 | Record not found (some routes) |
| 413 | Body too large — `{"error":"That upload is too large."}` |
| 429 | Too many wrong passwords (see 1.5) |
| 500 | Unexpected server error |

### 1.4 Body size limits
| Limit | Routes |
|---|---|
| **50 MB** | `POST /pdf/scan`, `POST /logs`, `POST /logs/batch`, `POST /logs/restore`, `POST /import-requests`, `POST /logs/:id/upac-form` |
| **2 MB** | everything else |

### 1.5 Rate limiting (login & admin password checks)
- **5 wrong attempts** within 15 minutes locks that key for **15 minutes**.
- Login key = client IP + normalised username. Admin-password confirmations are limited per admin account.
- Locked responses are `429` with `Retry-After` header and `retryAfter` (seconds) in the body.
- Counters live **in memory**: restarting the server clears them.

### 1.6 Real-time / caching behaviour
- Every non-GET request is flushed to disk before the response is sent.
- Changes are broadcast over **`GET /events`** (Server-Sent Events). Clients react by re-fetching.
- `GET /logs` is ETag-cached and gzip-compressed (see §4).

### 1.7 Data model cheat-sheet
Timestamps (`createdAt`, `updatedAt`, `at`, …) are **ISO-8601 UTC strings**. The app *displays* them in Asia/Dhaka.

<details>
<summary><strong>LogEntry</strong> (a connection record)</summary>

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `logNo` | number | Running number. Auto-assigned (max+1) if omitted on create |
| `date` | string | Free-text entry date, e.g. `"10 Jun 2024"` |
| `foremanName`, `foremanId`, `foremanPhone` | string | |
| `requestType` | string | e.g. "New User ID" |
| `customerName` | string | The name shown everywhere (Bangla first, else English) |
| `nameBn`, `nameEn` | string | Institute name per language |
| `headTeacherName`, `headTeacherPhone` | string | |
| `nmsId` | string | NMS / connection ID |
| `edcNo` | string | EDC Book No. |
| `emisEiinDghs` | string | Institution code |
| `routerSerial`, `mac` | string | |
| `lat`, `long` | string | |
| `unionName`, `upazila` | string | |
| `fiberLength` | string | metres |
| `category` | string | Auto-detected if empty (see below) |
| `issueFound`, `missingWrongDetails`, `actionTaken`, `reasonForAction`, `foremanInformed`, `followUpNeeded`, `status`, `supervisorInformed`, `remarks` | string | The "problem diary" fields |
| `followUpDate` | string | `YYYY-MM-DD` |
| `formReceivedAt` | string | Date the form arrived. **Only changes via the approval flow** |
| `billReceivedAt` | string | When the latest bill arrived |
| `billMonths` | string[] | `["2026-09", …]` months a bill was received for |
| `upacFormName/Type/Size/UploadedAt` | | Attached PDF metadata (bytes are stored as a file on disk) |
| `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | | Audit fields |
| `history` | `{at, by, action: 'created'\|'edited', changes?: {field, from, to}[]}[]` | Full change trail |
| `deletedAt`, `deletedBy` | | Set when in the Bin |

Categories: `Primary Education`, `Secondary Education`, `National University`, `Madrasa Education`, `Health Service`, `Land Reform Board`, `Govt. Organization`.
</details>

<details>
<summary><strong>User, Foreman, TeamMember, ApprovalRequest, ImportRequest, ActivityEvent</strong></summary>

```ts
User            { id, username, displayName, role: 'admin'|'user', phoneNumber?, email?, photoUrl?, disabled?, createdAt? }
Foreman         { id, name, area /* upazila key */, phone, photoUrl?, active, roam?, roamAreas?: string[], createdAt }
TeamMember      { id, foremanId, name, phone, role, active, createdAt }
ApprovalRequest { id, logId, logNo?, customer?, kind: 'form'|'bill', action: 'received'|'not_received',
                  requestedBy, requestedById?, requestedAt, status: 'pending'|'approved'|'rejected',
                  decidedBy?, decidedAt?, month? /* 'YYYY-MM' (bills) */, receivedOn? /* 'YYYY-MM-DD' (forms) */ }
ImportRequest   { id, requestedBy, requestedById?, requestedAt, status: 'pending'|'approved'|'rejected',
                  decidedBy?, decidedAt?, count, sample? }
ActivityEvent   { id, at, by, action, logNo?, customer?, detail? }
  action ∈ created | edited | deleted | cleared | restored | user_created | user_disabled | user_enabled | purged | password_reset
```
</details>

---

## 2. Quick index

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/login` | 🌐 | Sign in |
| GET | `/auth/me` | 🔑 | Current user |
| PUT | `/auth/profile` | 🔑 | Edit own profile |
| POST | `/auth/logout` | 🌐 | Sign out |
| POST | `/auth/change-password` | 🔑 | Change own password |
| POST | `/auth/note-password-changed` | 🔑 | No-op acknowledgement |
| GET | `/events` | 🔑 | Live-update stream (SSE) |
| GET | `/users/avatars` | 🔑 | Name → photo list |
| GET | `/users` | 🛡️ | List accounts |
| POST | `/users` | 🛡️ | Create account |
| POST | `/users/:id/disable` | 🛡️ | Disable / enable account |
| POST | `/admin/users/:id/reset-password` | 🛡️ | Set someone's password |
| GET | `/logs` | 🔑 | All live connection records |
| POST | `/logs` | 🔑 | Create or update a record |
| PATCH | `/logs/:id` | 🔑 | Partial update (autosave) |
| DELETE | `/logs/:id` | 🔑 | Move to Bin |
| POST | `/logs/batch` | 🔑 | Create many |
| POST | `/logs/bulk-fill` | 🔑 | Fill one field on many records |
| POST | `/logs/clear-all` | 🛡️ + password | Move everything to Bin |
| POST | `/logs/restore` | 🛡️ + password | Import/restore from backup JSON |
| POST | `/logs/:id/upac-form` | 🔑 | Attach UPAC PDF |
| GET | `/logs/:id/upac-form` | 🔑 | Download attached PDF |
| DELETE | `/logs/:id/upac-form` | 🔑 | Remove attached PDF |
| POST | `/pdf/scan` | 🔑 | Read data out of UPAC PDFs |
| GET | `/approvals` | 🔑 | List form/bill requests |
| POST | `/approvals/request` | 🔑 | Mark forms/bills (admin = instant) |
| POST | `/approvals/decide` | 🛡️ | Approve / reject requests |
| DELETE | `/approvals/:id` | 🔑 | Withdraw a pending request |
| GET | `/import-requests` | 🔑 | List CSV import requests |
| POST | `/import-requests` | 🔑 | Submit a CSV import for approval |
| POST | `/import-requests/:id/decide` | 🛡️ | Approve / reject an import |
| DELETE | `/import-requests/:id` | 🔑 | Withdraw an import request |
| GET | `/foremen` | 🔑 | List foremen |
| POST | `/foremen` | 🔑 | Create foreman |
| PUT | `/foremen/:id` | 🔑 (roam fields 🛡️) | Update foreman |
| DELETE | `/foremen/:id` | 🔑 | Move foreman to Bin |
| GET | `/team-members` | 🔑 | List team members |
| POST | `/team-members` | 🔑 | Add team member |
| PUT | `/team-members/:id` | 🔑 | Update team member |
| DELETE | `/team-members/:id` | 🔑 | Remove team member |
| GET | `/bin` | 🛡️ | List deleted logs & foremen |
| POST | `/bin/logs/:id/restore` | 🛡️ | Restore a log |
| POST | `/bin/foremen/:id/restore` | 🛡️ | Restore a foreman |
| DELETE | `/bin/logs/:id` | 🛡️ | Delete a log forever |
| DELETE | `/bin/foremen/:id` | 🛡️ | Delete a foreman forever |
| DELETE | `/bin` | 🛡️ | Empty the Bin |
| GET | `/suggestions` | 🔑 | Autocomplete lists |
| POST | `/suggestions` | 🔑 | Replace autocomplete lists |
| GET | `/activity` | 🔑 | Activity feed |
| POST | `/activity` | 🔑 | Add an activity line |
| GET | `/meta` | 🌐 | Form Maker field definitions |
| GET | `/lookup?edc=…` | 🔑 | Look up an institute by EDC no. |
| POST | `/generate` | 🔑 | Generate the filled Word form |

---

## 3. Authentication

### `POST /auth/login` 🌐
Signs in and sets the session cookie.

**Body**
```json
{ "username": "admin", "password": "secret-password" }
```
Username is normalised: trimmed, lower-cased, spaces → `_`.

**200**
```json
{ "user": { "id": "…", "username": "admin", "displayName": "Administrator", "role": "admin",
            "phoneNumber": null, "email": null, "photoUrl": null, "disabled": false, "createdAt": "…" } }
```
**Errors:** `400` missing fields · `401` wrong credentials (`attemptsRemaining` included) · `403` account disabled · `429` locked.

### `GET /auth/me` 🔑
Returns `{ "user": {…} }` for the current session. Used on page load.

### `PUT /auth/profile` 🔑
Edit your own profile. Any of: `displayName`, `phoneNumber`, `email`, `photoUrl` (a compressed image data-URL in the app). Blank `displayName` keeps the old one.
**200** `{ "ok": true, "user": {…} }` · **400** with a message.

### `POST /auth/logout` 🌐
Clears the cookie. **200** `{ "ok": true }`. *(Tokens are stateless — see Notes.)*

### `POST /auth/change-password` 🔑
**Body** `{ "password": "new-password" }` — minimum **8** characters. **200** `{ "ok": true }`.

### `POST /auth/note-password-changed` 🔑
Acknowledgement hook; does nothing. **200** `{ "ok": true }`.

---

## 4. Live updates

### `GET /events` 🔑 — Server-Sent Events
Keeps the connection open (`text/event-stream`). A comment line `: ping` is sent every **25 s** to keep it alive. Each change is a message:

```
data: {"type":"logs","payload":{"id":"…","action":"updated"},"timestamp":"2026-10-11T09:30:00.000Z"}
```

`type` values: `logs`, `foremen`, `approvals`, `imports`, `activity`, `suggestions`, `users`.
The event says **what kind** of data changed — not the new data. The client waits ~300 ms (debounce) and re-fetches the matching list.

```js
const es = new EventSource('/api/events', { withCredentials: true });
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

## 5. Users (accounts)

### `GET /users/avatars` 🔑
`[ { "displayName": "Rahim", "photoUrl": "data:image/jpeg;base64,…" }, … ]` — used to show faces in the activity feed.

### `GET /users` 🛡️
All accounts (no passwords).

### `POST /users` 🛡️
**Body** `{ "username": "rahim", "password": "at-least-8", "displayName": "Rahim" }`
New accounts always get role `user`. **200** returns the created user. **400** if username empty/taken or password < 8.

### `POST /users/:id/disable` 🛡️
**Body** `{ "disabled": true }` (or `false` to re-enable). The administrator account can't be disabled. A disabled user's existing cookie stops working immediately. **200** `{ "ok": true }`.

### `POST /admin/users/:id/reset-password` 🛡️
**Body** `{ "password": "new-one-8+" }`. **200** `{ "ok": true }`.

---

## 6. Connection records ("logs")

### `GET /logs` 🔑
Returns the **array of all non-deleted records**, ordered by `logNo` ascending.

Caching: the response carries `ETag: "logs-<boot>-<revision>"` and `Cache-Control: no-cache`. Send `If-None-Match` to get a cheap **`304`**. If you send `Accept-Encoding: gzip`, you get a pre-compressed body (`Content-Encoding: gzip`).

### `POST /logs` 🔑
Create or update one record.

**Body**
```json
{
  "entry": { "date": "10 Oct 2026", "foremanName": "Shabul", "requestType": "New User ID",
             "customerName": "Hasampur Govt. Primary School", "nmsId": "12345",
             "status": "In Progress", "mac": "20:23:51:78:49:F4" },
  "existingId": null
}
```
- Without `existingId` (and no `entry.id` that exists) → **creates**. `logNo` defaults to *max + 1*.
- With `existingId` → **updates** and appends a change to `history`.
- `category` is auto-detected if blank.
- **Form/bill received fields are only honoured on create by an admin.** On update they're ignored — use `/approvals/request`.
- New values are also harvested into the autocomplete lists.

**200** the saved `LogEntry`. **400** `Connection data is required.`

### `PATCH /logs/:id` 🔑
Partial update, used by the editor's autosave.
**Body** `{ "fields": { "mac": "AA:BB:…", "remarks": "…" } }`
`id`, `createdAt/By`, `updatedAt/By`, `history`, `deletedAt/By` are ignored if sent. **200** the saved record · **404** `Connection not found.`

### `DELETE /logs/:id` 🔑
Soft delete (moves to the Bin; recorded in the activity feed). **200** `{ "ok": true }` (`false` if the id doesn't exist).

### `POST /logs/batch` 🔑
**Body** `{ "entries": [ {…}, {…} ] }` — all saved in **one transaction**. Missing `logNo`s are numbered consecutively.
**200** `{ "saved": [LogEntry…], "count": 2 }` · **400** if empty.

### `POST /logs/bulk-fill` 🔑
Writes **one field** on many records ("Fill field from a list").

**Body**
```json
{ "field": "mac", "items": [ { "id": "<log id>", "value": "20:23:51:78:49:F4" } ] }
```
Allowed `field`: `mac, routerSerial, edcNo, emisEiinDghs, lat, long, fiberLength, unionName, upazila, headTeacherName, headTeacherPhone, nameBn, nameEn, remarks`.
Max **5000** items; each value trimmed and cut at 500 chars. Setting `nameBn`/`nameEn` also refreshes `customerName`.
**200** `{ "updated": 12, "unchanged": 3, "missing": 1 }` · **400** bad field / empty / too many.

### `POST /logs/clear-all` 🛡️ + password
**Body** `{ "password": "<your admin password>" }`
Moves **every** record to the Bin. **200** `{ "cleared": 480 }` · **403** wrong password · **429** locked.

### `POST /logs/restore` 🛡️ + password
Imports records from a backup file made by the app's *Backup → Export JSON*.

**Body**
```json
{ "logs": [ … ], "merge": true, "password": "<admin password>", "local": false }
```
- `merge: false` → current records go to the Bin first, then the file is loaded ("replace").
- `merge: true` → records are added/overwritten by `id`.
- The password is required, **except** when `local` **and** `merge` are both `true`.
- Old files using "reseller…" field names are upgraded automatically.

**200** `{ "total": <live record count after import> }` · **400** `Connections array is required.`

---

## 7. Attached UPAC forms

Files are stored on disk at `data/files/upac/<log id>`, **not** inside the database.

### `POST /logs/:id/upac-form` 🔑
**Body**
```json
{ "name": "UPAC_Form.pdf", "data": "data:application/pdf;base64,JVBERi0x…", "type": "application/pdf", "size": 123456 }
```
`data` may be a data-URL or bare base64. **200** `{ "ok": true, "log": {…} }` · **400** `Form data is required.` / record not found.

### `GET /logs/:id/upac-form` 🔑
Downloads the file (`Content-Disposition: attachment`, original name sanitised). **404** if nothing attached.

### `DELETE /logs/:id/upac-form` 🔑
**200** `{ "ok": true, "log": {…} }`.

---

## 8. UPAC PDF scanner

### `POST /pdf/scan` 🔑
Reads the **text layer** of page 1 of one or more UPAC PDFs and extracts the fields. No network, no AI — fixed-label rules. Legacy **Bijoy** Bangla text is converted to Unicode. Scanned images (no text layer) fail with a clear message.

**Body**
```json
{ "files": [ { "name": "school1.pdf", "data": "<base64 or data-URL>" } ] }
```

**200**
```json
{
  "results": [ {
    "fileName": "school1.pdf",
    "customerName": "…", "edcNo": "…", "nmsId": "…",
    "upazila": "…", "unionName": "…",
    "lat": "…", "long": "…",
    "routerSerial": "…", "mac": "…",
    "fiberLength": "…", "headTeacherPhone": "…",
    "date": "05 Oct 2026",
    "confidence": 0.89,
    "warnings": ["Institute name taken from the EDC index (EDC 1234) because the PDF text for it is unreadable.", "Router MAC is blank on this form."]
  } ],
  "errors": [ { "fileName": "scan.pdf", "error": "…" } ]
}
```
`confidence` = share of the 9 key fields found (0–1). **Always check `warnings`.** One bad file doesn't stop the others. **400** if `files` is empty.

---

## 9. Form / bill "received" marks & approvals

**How it works:** *Bills* are marked **per month** (`YYYY-MM`); *forms* by **received date** (`YYYY-MM-DD`).
- **Admin** marks are applied **immediately**.
- **Normal user** marks become **pending requests** for an admin to approve.
- A newer request for the same record + kind (+ month for bills) **replaces** the older pending one.

### `GET /approvals` 🔑
Array of `ApprovalRequest` (all statuses).

### `POST /approvals/request` 🔑
**Body**
```json
{ "items": [
  { "logId": "…", "kind": "bill", "action": "received", "month": "2026-09" },
  { "logId": "…", "kind": "form", "action": "received", "receivedOn": "2026-10-05" }
] }
```
`action`: `received` | `not_received`.
**200** `{ "applied": 1, "queued": 1, "skipped": 0 }`
(`skipped` = bad item, deleted record, or already in that state.) **400** `Nothing to mark.`

### `POST /approvals/decide` 🛡️
**Body** `{ "ids": ["…"], "approve": true }` — or `{ "all": true, "approve": false }` to decide **every** pending request.
`approve` defaults to `true`. If the log was deleted meanwhile, the request is closed as *rejected*.
**200** `{ "approved": 3, "rejected": 0 }`

### `DELETE /approvals/:id` 🔑
Withdraw a **pending** request. Only the person who made it, or an admin. **200** `{ "ok": true|false }`.

---

## 10. CSV import requests

The browser parses the CSV; the API stores the parsed entries until an admin approves.

### `GET /import-requests` 🔑
Admins see all; others see only their own.

### `POST /import-requests` 🔑
**Body** `{ "entries": [ {LogEntry…}, … ] }` → **200** `ImportRequest` (with `count` and a short `sample`). **400** `Nothing to import.`

### `POST /import-requests/:id/decide` 🛡️
**Body** `{ "approve": true }` (default true). Approving saves all entries as a batch.
**200** `{ "status": "approved", "saved": 120 }` (or `"rejected"`, `0`).

### `DELETE /import-requests/:id` 🔑
Withdraw (requester or admin). **200** `{ "ok": true|false }`.

---

## 11. Foremen & teams

### `GET /foremen` 🔑
Active (non-deleted) foremen, sorted by name.

### `POST /foremen` 🔑
**Body** `{ "name": "Rahim", "area": "Beanibazar", "phone": "+880 1700-000000", "photoUrl": "data:image/jpeg;base64,…" }`
- `name` required; `area` must be one of the **13 upazilas** (aliases/spellings accepted and normalised).
- Same name in the same upazila → `400`.
**200** the `Foreman`.

### `PUT /foremen/:id` 🔑
Any of `name, area, phone, active, photoUrl, roam, roamAreas`.
**`roam` and `roamAreas` are silently dropped unless you're an admin.** `roamAreas: []` with `roam: true` = any upazila.

### `DELETE /foremen/:id` 🔑
Soft delete → Bin. **200** `{ "ok": true }`.

### Team members
| Route | Body / notes |
|---|---|
| `GET /team-members` | all members |
| `POST /team-members` | `{ "foremanId", "name", "phone?", "role?" }` — foreman must exist; duplicate name inside the same team → 400 |
| `PUT /team-members/:id` | any of `name, phone, role, active` |
| `DELETE /team-members/:id` | soft delete → `{ "ok": true }` |

---

## 12. Admin Bin

| Route | Result |
|---|---|
| `GET /bin` 🛡️ | `{ "logs": [...], "foremen": [...] }` (deleted items) |
| `POST /bin/logs/:id/restore` 🛡️ | `{ "ok": true }` |
| `POST /bin/foremen/:id/restore` 🛡️ | `{ "ok": true }` |
| `DELETE /bin/logs/:id` 🛡️ | Permanently deletes the row **and its attached form file** → `{ "ok": true }` |
| `DELETE /bin/foremen/:id` 🛡️ | Permanently deletes → `{ "ok": true }` |
| `DELETE /bin` 🛡️ | Empties everything → `{ "purged": <count> }` |

⚠️ Permanent deletes are **not undoable** and don't ask for the admin password at the API level (the UI asks for confirmation).

---

## 13. Suggestions & activity

### `GET /suggestions` 🔑
`{ "foremanName": ["…"], "requestType": ["…"], "status": ["…"], … }` — autocomplete lists per field.

### `POST /suggestions` 🔑
Replaces the stored lists with the body (same shape). **200** `{ "ok": true }`. (The app only exposes the editor to admins, but the API does not enforce it.)

### `GET /activity` 🔑
The latest **200** activity events, newest first.

### `POST /activity` 🔑
**Body** `{ "action": "edited", "logNo": 12, "customer": "…", "detail": "…" }` — `by` is taken from your session. **200** `{ "ok": true }`.

---

## 14. Form Maker (Word form generator)

### `GET /meta` 🌐
The fields the generated form needs:
```json
{ "fields": [ { "key": "name", "label": "প্রতিষ্ঠানের নাম (Institute Name)", "default": "" },
              { "key": "cable_brand", "label": "Optical Fiber Cable Brand", "default": "BRB" },
              { "key": "cable_qty", "label": "Optical Fiber Cable Qty (meters)", "default": "1500" } ] }
```
Keys: `name, mobile, union, upazila, source_no, connection_nms, institution_code, lat_long, router_serial, router_mac, cable_brand, cable_qty`.

### `GET /lookup?edc=<number>` 🔑
Looks up an institute by **EDC Book No.** in the Excel index (`data/toscrape.xlsx`, falling back to `data/index.json`). `total` is the number of EDC numbers in the index.
```json
{ "matches": [ { "sheet": "Sheet1", "data": { "name": "…", "mobile": "…", "union": "…", "upazila": "…", "source_no": "…",
                  "connection_nms": "…", "institution_code": "…", "lat_long": "…", "router_serial": "…", "router_mac": "…" } } ],
  "source": "<which file was used, or \"none\">", "total": 4210 }
```
Empty/unknown number → `{ "matches": [] }`. A trailing `.0` (Excel number quirk) is stripped.

### `POST /generate` 🔑
**Body**
```json
{ "date": "2026-10-11",
  "data": { "name": "…", "source_no": "…", "connection_nms": "…", "router_mac": "20-23-51-78-49-F4", "cable_qty": "1200" } }
```
- `date` required (`YYYY-MM-DD`); it's written in Bangla digits (`১১/১০/২০২৬`).
- Blank fields fall back to defaults (`cable_brand` = `BRB`, `cable_qty` = `1500`).
- `router_mac` is cleaned into a standard format.

**200** — the `.docx` file itself:
`Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`Content-Disposition: attachment; filename="<nms|edc|name>.docx"`, plus headers `X-Filename` (URL-encoded) and `X-Mac` (the cleaned MAC).

```bash
curl -b jar.txt -H 'Content-Type: application/json' \
  -d '{"date":"2026-10-11","data":{"name":"Test School","source_no":"1234"}}' \
  -o form.docx http://localhost:3000/api/generate
```

---

## 15. Notes, quirks & known gaps (read before building on this)

1. **Sessions are stateless.** The cookie is a signed token `userId.expiry.HMAC`. Logout only clears the cookie; a copied token stays valid until it expires (30 days) — *except* that **disabling the account** makes it fail instantly. Changing a password does **not** invalidate existing tokens. Deleting `data/pace_it_secret.key` invalidates all of them.
2. **Rate limiting is in-memory and per IP+username.** It trusts the `X-Forwarded-For` header, so behind no proxy a client could spoof it. Fine for a trusted office network; revisit before exposing to the internet.
3. **Role checks exist only on the routes marked 🛡️.** Some things the UI shows only to admins (for example editing the suggestion lists via `POST /suggestions`) are open to any logged-in user at the API level.
4. **`GET /meta` is public** (harmless field labels).
5. **Soft-deleted vs. gone:** `DELETE /logs/:id` and `DELETE /foremen/:id` only hide the item. Use the Bin routes to really remove.
6. **IDs are UUIDs**, except `logNo`, which is a human-friendly sequence and is *not* guaranteed gap-free.
7. **`POST /logs` is an upsert** — passing a known `entry.id` updates rather than creates.
8. **Dates on logs are free text** (`"10 Oct 2026"`), while `followUpDate`, `receivedOn` and `month` are strict ISO-like formats.
