---
type: plan
status: active
tags: [netsuite-discovery, suiteql, system-notes, fsm, process-profile, read-only]
relatedTo: [netsuite-mapping, supabase-handover]
---

# NetSuite discovery

A one off, read only profile of how McCormacks uses NetSuite for bookings, scheduling, field service and invoicing. **Not part of the app.** It feeds [docs/netsuite-mapping.md](../docs/netsuite-mapping.md) and the integration decision table.

## How it works

- `netsuite_extract.py` calls NetSuite's REST web services directly from this machine, using the OAuth 2 client credentials in `.env.local` (git ignored). Only SuiteQL SELECT queries and the metadata catalogue. Nothing is written to NetSuite.
- Customer details (names, emails, phones, addresses, free text, rego and VIN) are redacted before anything is saved, **unless a query is run with `--raw`**. Raw extracts (`notes_*` and `employees_named`) keep free text and staff names, stay in the git ignored `discovery/data/` folder and are marked RAW in `queries.sql`. Never quote them in docs or paste them into chat. Describe them in general terms or mask them first.
- Results go to `discovery/data/` (git ignored) as JSON and into `netsuite.sqlite` for local analysis. Every query run is appended to `queries.sql` so the extract can be repeated.
- One request at a time with a short pause. Re-analysis uses the local SQLite file, not NetSuite.

## Credentials in `.env.local`

`NETSUITE_ACCOUNT_ID`, `NETSUITE_REST_URL`, `NETSUITE_CLIENT_ID`, `NETSUITE_CERTIFICATE_ID` and `NETSUITE_PRIVATE_KEY`. The private key can be on one line with `\n` between lines, or in double quotes across several lines. Remove them from `.env.local` when discovery is finished.

The script logs in as the integration role, so it sees only what that role can see.

## Scope

Activity in the last 60 days only, on the records involved in a workshop job: customers and vehicles, cases, tasks and calendar events, FSM records, time bills, estimates, sales orders and invoices, employees and their roles.

## Stages

1. `check`, then the metadata catalogue and field lists for the key records (no data).
2. Volume probe: counts by record type and change source.
3. Status lists and record counts for the last 60 days.
4. Detail extracts for the relevant record types only, chunked by date.
5. Job traces: a handful of completed jobs rebuilt as timelines of who changed what, when and from where (screen, mobile, script or workflow).

## Status (11/11/2026)

The 60 day extract is done. See [PROFILE.md](PROFILE.md) for the findings. Run `python discovery/netsuite_extract.py check` to confirm the login still works.

- **Readable now:** customers, transactions, tasks, cases, employees, items, locations, time bills, vehicle records and the FSM custom records. The metadata catalogue lists 297 record types.
- **Still hidden:** System Notes for job records, so we cannot see who changed what or from where. Only 21 setup notes appear.
- **Extracted raw on 11/11/2026 at the owner's request, local only:** case titles, details and job details, task titles, comments and completion notes, order memos, vehicle notes and the named staff roster. See "How notes are used" in [PROFILE.md](PROFILE.md).
- **Not readable:** the notes tab and message history. The `note` and `message` tables are reported as not found for this role.
- **Load:** about 150 requests in total, one at a time. A single count over all of System Notes timed out after 3 minutes, so the script now fails cleanly on slow queries and never retries them.

**Rules for further queries:** SELECT only, no `SELECT *` on cases or transactions (explicit columns keep free text out), and date ranges short enough to answer in seconds.
