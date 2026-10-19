# Pace IT Management

Internal web application for tracking institute internet connections (EDC / UPAC), the foremen who install them, form and bill reconciliation, and the follow-up on each connection. It runs on a single office machine; users connect through a browser.

## Architecture

```
Browser (React)  <── JSON over /api ──>  Node + Express  ──>  SQLite (data/pace_it.sqlite)
                 <── Server-Sent Events (live updates) ──
```

- One server and one database file; changes made by one user appear on every connected screen.
- Database: Node's built-in `node:sqlite`. Attached UPAC PDFs are stored as plain files under `data/files/upac`.
- The server also parses UPAC PDFs, fills the Word form template and creates database backups.

## Features

| Screen | Purpose |
|---|---|
| Dashboard | Counts, recent connections, team activity, data completeness |
| Connection Records | Search, filter, sort, print, export (PDF / Excel), CSV import, bulk field fill, per-record history |
| Forms | Track paper forms sent and received per foreman |
| Bills | Track bills received per month |
| Requests | Admin approval queue for form/bill marks and CSV imports made by regular users |
| Form Maker | Look up an institute by EDC number and generate the filled Word form |
| Foremen | Foreman directory, teams and supply numbers |
| Coverage | Connections per upazila and union |
| Targets | Target institute list compared with connected institutes |
| Admin | Accounts, bin (soft-deleted items), security, backup and restore, audit log |

Business rules:

- Regular users cannot mark a form or bill as received directly; the mark becomes a request for an admin to approve. CSV imports follow the same flow.
- Deletion is soft. Deleted records go to the admin bin and can be restored or removed permanently by an admin.
- Destructive admin actions (clear all data, restore from backup) require the admin password again.
- Every change is recorded in the record history and the shared activity feed.
- Categories are detected automatically from the institute name unless set manually.
- Timestamps are displayed in Asia/Dhaka time.

## Requirements

Node.js 22.16 or newer (`node -v`).

## Getting started

```bash
npm install
npm run build
npm start            # http://localhost:3000  (set PORT to change)
```

Development with hot reload: `npm run dev`. Type check: `npm run lint`.

On the first start an `admin` user is created with a random password that is printed once in the terminal. Change it after signing in.

Start the server from the directory that contains `package.json`; `data/` is resolved relative to the working directory. Run one server per `data` directory, on a local disk.

### Data directory

| Path | Description |
|---|---|
| `pace_it.sqlite` | Database (created automatically) |
| `files/upac/` | Attached UPAC PDFs |
| `toscrape.xlsx` | EDC institute list used by Form Maker and the PDF reader. Must be provided; can be replaced without a restart |
| `index.json` | Fallback copy of the institute list, used only when no `.xlsx` is present |
| `pace_it_secret.key` | Key used to sign session cookies (created automatically) |
| `certs/cert.pem`, `certs/key.pem` | Optional. When both exist the server switches to HTTPS |
| `backups/` | Automatic daily database copies (newest 30 kept) |

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Listening port |
| `HOST` | `0.0.0.0` | Bind address (`127.0.0.1` for local only) |
| `SSL_CERT`, `SSL_KEY` | `data/certs/*` | Paths to the TLS certificate and key |
| `COOKIE_SECURE` | unset | Set to `1` when a reverse proxy provides HTTPS |
| `PACE_BACKUP_DIR`, `PACE_BACKUP_KEEP` | unset | Defaults for `npm run backup` |

## Backups

The server writes a daily database copy to `data/backups/`. These are on the same disk, so also run the full backup to a separate drive:

```bash
npm run backup -- /mnt/usb/paceit            # Linux
npm run backup -- D:\PaceBackups             # Windows
npm run backup -- /mnt/usb/paceit --keep 60  # keep 60 snapshots
```

It is safe to run while the server is running. It stores a database snapshot and a mirror of the attached forms, verifies both and prints `BACKUP OK`. The destination must be outside `data/`.

Scheduling:

- Linux (cron, daily at 02:00): `0 2 * * * cd /path/to/paceit && npm run backup -- /mnt/usb/paceit >> backup.log 2>&1`
- Windows: `schtasks /Create /SC DAILY /ST 02:00 /TN "PaceIT Backup" /TR "cmd /c cd /d C:\path\to\paceit && npm run backup -- D:\PaceBackups"`

Restore (stop the server first and keep the old `data` directory until the restored one is verified):

1. Copy the newest `db/pace_it-<date>.sqlite` to `data/pace_it.sqlite` and delete `pace_it.sqlite-wal` and `pace_it.sqlite-shm` if present.
2. Copy the backup's `files/upac` directory to `data/files/upac`.
3. Start the server and open a record with an attached form to confirm.

## Project layout

```
server.ts               Express setup, HTTPS switch, request limits, static serving
server/api.ts           API routes, authentication, rate limiting, live-update stream
server/db.ts            Schema, migrations and business rules
server/pdfExtractor.ts  UPAC PDF parsing (bijoy.ts decodes legacy Bangla font text)
server/docxFiller.ts    Fills template/EDC Form.docx
server/edcIndex.ts      Loads the EDC institute list
scripts/backup.ts       Full backup tool
src/App.tsx             Application shell, data loading, live updates, navigation
src/components/         Screens and dialogs
src/utils/              Helpers: categories, upazilas, dates, exports, CSV import
```

## Documentation

- [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md): architecture, data model, rules and operations
- [docs/API.md](docs/API.md): HTTP endpoint reference

## Stack

React 19, Vite, Tailwind CSS 4, Express 4, Node built-in SQLite, TypeScript.
