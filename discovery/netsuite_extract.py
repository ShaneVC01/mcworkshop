"""
NetSuite discovery extracts. Not part of the app.

Calls NetSuite's REST web services directly from this machine (read only: SuiteQL SELECT and the
metadata catalogue), redacts customer details, and stores each result locally so it can be
re-analysed without asking NetSuite again:
  discovery/data/<name>.json        raw rows (redacted)
  discovery/data/netsuite.sqlite    one table per extract, for local SQL
  discovery/queries.sql             every query that was run, so the extract can be repeated

Usage (from the project root):
  python discovery/netsuite_extract.py check
  python discovery/netsuite_extract.py catalog
  python discovery/netsuite_extract.py schema supportcase task timebill
  python discovery/netsuite_extract.py sql <name> "<SELECT ...>" [--max N]

Prints names, row counts and column names only. Never values, never credentials.
Reads NETSUITE_ACCOUNT_ID, NETSUITE_REST_URL, NETSUITE_CLIENT_ID, NETSUITE_CERTIFICATE_ID and
NETSUITE_PRIVATE_KEY from .env.local (git ignored).
"""
import json
import random
import re
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import jwt  # PyJWT
import requests
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from cryptography.hazmat.primitives.serialization import load_pem_private_key

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "discovery" / "data"
QUERIES = ROOT / "discovery" / "queries.sql"
PAGE = 1000
PAUSE_SECONDS = 0.5  # one request at a time with a short gap, to stay gentle on NetSuite
TIMEOUT_SECONDS = 180
MAX_ATTEMPTS = 4
REQUIRED = ["NETSUITE_ACCOUNT_ID", "NETSUITE_REST_URL", "NETSUITE_CLIENT_ID", "NETSUITE_CERTIFICATE_ID", "NETSUITE_PRIVATE_KEY"]


# ---- Configuration ----------------------------------------------------------------------------------


def read_env_file():
    """Parses .env.local, including a quoted value that spans several lines (a PEM key)."""
    values, lines, i = {}, (ROOT / ".env.local").read_text(encoding="utf-8-sig").splitlines(), 0
    while i < len(lines):
        m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)$", lines[i])
        i += 1
        if not m:
            continue
        key, value = m.group(1), m.group(2).strip()
        if value[:1] in ('"', "'"):
            quote = value[0]
            value = value[1:]
            while not value.rstrip().endswith(quote) and i < len(lines):
                value += "\n" + lines[i]
                i += 1
            value = value.rstrip()[:-1] if value.rstrip().endswith(quote) else value
        values[key] = value
    return values


def load_config():
    values = read_env_file()
    missing = [k for k in REQUIRED if not values.get(k)]
    if missing:
        sys.exit(f"Missing in .env.local: {', '.join(missing)}")
    rest = values["NETSUITE_REST_URL"].strip()
    rest = rest if rest.startswith("http") else f"https://{rest}"
    rest = re.sub(r"/services/.*$", "", rest).rstrip("/")
    pem = values["NETSUITE_PRIVATE_KEY"].replace("\\n", "\n").strip()
    key = load_pem_private_key(pem.encode(), password=None)
    if isinstance(key, rsa.RSAPrivateKey):
        alg = "PS256"
    elif isinstance(key, ec.EllipticCurvePrivateKey):
        alg = {256: "ES256", 384: "ES384", 521: "ES512"}[key.curve.key_size]
    else:
        sys.exit("NETSUITE_PRIVATE_KEY must be an RSA or EC private key.")
    return {"rest": rest, "client_id": values["NETSUITE_CLIENT_ID"].strip(), "kid": values["NETSUITE_CERTIFICATE_ID"].strip(), "key": key, "alg": alg}


CONFIG = None
TOKEN = {"value": None, "expires": 0}
SESSION = requests.Session()


def config():
    global CONFIG
    CONFIG = CONFIG or load_config()
    return CONFIG


# ---- NetSuite calls -------------------------------------------------------------------------------


def access_token(force=False):
    if not force and TOKEN["value"] and time.time() < TOKEN["expires"]:
        return TOKEN["value"]
    c = config()
    token_url = f"{c['rest']}/services/rest/auth/oauth2/v1/token"
    now = int(time.time())
    assertion = jwt.encode(
        {"iss": c["client_id"], "scope": ["rest_webservices"], "aud": token_url, "iat": now, "exp": now + 300, "jti": str(uuid.uuid4())},
        c["key"],
        algorithm=c["alg"],
        headers={"kid": c["kid"], "typ": "JWT"},
    )
    res = SESSION.post(
        token_url,
        data={
            "grant_type": "client_credentials",
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": assertion,
        },
        timeout=60,
    )
    if res.status_code != 200:
        body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
        raise RuntimeError(f"token refused ({res.status_code}): {body.get('error', '')} {body.get('error_description', '')}".strip())
    body = res.json()
    TOKEN["value"], TOKEN["expires"] = body["access_token"], time.time() + int(body.get("expires_in", 3600)) - 120
    return TOKEN["value"]


def describe_error(res):
    try:
        body = res.json()
    except ValueError:
        return f"HTTP {res.status_code}"
    details = body.get("o:errorDetails") or [{}]
    code = details[0].get("o:errorCode") or body.get("title") or f"HTTP {res.status_code}"
    detail = (details[0].get("detail") or "")[:400]
    return f"{code}: {detail}" if detail else code


def netsuite(method, path, body=None, headers=None):
    refreshed = False
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            res = SESSION.request(
                method,
                f"{config()['rest']}{path}",
                json=body,
                headers={"authorization": f"Bearer {access_token()}", "accept": "application/json", **(headers or {})},
                timeout=TIMEOUT_SECONDS,
            )
        except requests.exceptions.Timeout:
            # Do not retry a slow query: that would only add load. Ask for a narrower one instead.
            raise RuntimeError(f"no answer within {TIMEOUT_SECONDS}s. Narrow the query (shorter date range or fewer record types).")
        except requests.exceptions.ConnectionError:
            if attempt < MAX_ATTEMPTS:
                time.sleep(2 * attempt)
                continue
            raise RuntimeError("could not reach NetSuite")
        if res.ok:
            return res.json()
        if res.status_code == 401 and not refreshed:
            refreshed = True
            access_token(force=True)
            continue
        if (res.status_code == 429 or res.status_code >= 500) and attempt < MAX_ATTEMPTS:
            retry_after = res.headers.get("retry-after")
            wait = float(retry_after) if retry_after and retry_after.isdigit() else 0.8 * 2 ** (attempt - 1) * (1 + random.random() / 2)
            time.sleep(min(wait, 30))
            continue
        raise RuntimeError(describe_error(res))
    raise RuntimeError("NetSuite kept failing after retries")


# ---- Redaction (customer details never reach disk) ----------------------------------------------

PII_NAME = re.compile(
    r"(e-?mail|phone|mobile|fax|addr|street|city|zip|postcode|firstname|lastname|middlename|companyname|altname|fullname|"
    r"salutation|entitytitle|^entityid$|addressee|attention|contact|comment|memo|message|^title$|subject|custname|vin|"
    r"serial|rego|registration|plate|licen|password|bank|card|abn|dob|birth|(?<!trans)action|note|descr|detail|(?<!con)text|reason|"
    r"signature|geo|latitude|longitude|unitno|enginenumber|image|customer_?name|postcode|incident)",
    re.I,
)
EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
PHONE = re.compile(r"(\d[\s-]?){8,}")


def redact_value(value):
    if not isinstance(value, str):
        return value
    if EMAIL.search(value) or PHONE.search(value):
        return "[redacted]"
    return f"[text {len(value)} chars]" if len(value) > 120 else value


def redact_row(row):
    field = row.get("field") if isinstance(row.get("field"), str) else ""
    pii_field = bool(PII_NAME.search(field))
    out = {}
    for key, value in row.items():
        if key == "links":
            continue
        if value in (None, ""):
            out[key] = value
        elif PII_NAME.search(key) or (pii_field and "value" in key.lower()):
            out[key] = "[redacted]"
        else:
            out[key] = redact_value(value)
    return out


# ---- Storage ----------------------------------------------------------------------------------------


def store(name, rows, note):
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / f"{name}.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding="utf-8")
    columns = []
    for row in rows:
        for key in row:
            if key not in columns:
                columns.append(key)
    db = sqlite3.connect(DATA / "netsuite.sqlite")
    table = re.sub(r"\W", "_", name)
    db.execute(f'DROP TABLE IF EXISTS "{table}"')
    if columns:
        db.execute(f'CREATE TABLE "{table}" ({", ".join(f"[{c}]" for c in columns)})')
        db.executemany(
            f'INSERT INTO "{table}" VALUES ({", ".join("?" for _ in columns)})',
            [[json.dumps(row.get(c)) if isinstance(row.get(c), (dict, list)) else row.get(c) for c in columns] for row in rows],
        )
    db.execute("CREATE TABLE IF NOT EXISTS _runs (name, rows, ran_at, note)")
    db.execute("INSERT INTO _runs VALUES (?, ?, ?, ?)", (name, len(rows), datetime.now(timezone.utc).isoformat(), note))
    db.commit()
    db.close()
    return columns


# ---- Commands ---------------------------------------------------------------------------------------


def run_sql(name, sql, max_rows=None, raw=False):
    """raw=True keeps free text and names as returned. Only for data that stays on this machine."""
    if not re.match(r"^\s*(select|with)\s", sql, re.I):
        sys.exit("Only SELECT queries are allowed.")
    rows, offset, pages, more = [], 0, 0, True
    while more:
        body = netsuite("POST", f"/services/rest/query/v1/suiteql?limit={PAGE}&offset={offset}", {"q": sql}, {"prefer": "transient"})
        rows.extend(({k: v for k, v in r.items() if k != "links"} if raw else redact_row(r)) for r in body.get("items", []))
        pages += 1
        more = bool(body.get("hasMore"))
        offset += PAGE
        if max_rows and len(rows) >= max_rows:
            rows, more = rows[:max_rows], False
        if more:
            time.sleep(PAUSE_SECONDS)
    columns = store(name, rows, "suiteql")
    with QUERIES.open("a", encoding="utf-8") as f:
        f.write(f"-- {name} ({datetime.now().strftime('%d/%m/%Y %H:%M')}, {len(rows)} rows{', RAW' if raw else ''})\n{sql.strip()};\n\n")
    print(f"{name}: {len(rows)} rows in {pages} page(s). Columns: {', '.join(columns)}")


def main(argv):
    if not argv:
        sys.exit(__doc__)
    cmd = argv[0]
    try:
        if cmd == "check":
            access_token()
            print(f"Token OK ({config()['alg']}).")
        elif cmd == "catalog":
            body = netsuite("GET", "/services/rest/record/v1/metadata-catalog")
            names = [i["name"] for i in body.get("items", [])]
            store("catalog", [{"record": n} for n in names], "metadata catalogue")
            print(f"catalog: {len(names)} record types, {sum(n.startswith('customrecord') for n in names)} custom record types")
        elif cmd == "schema":
            for record in argv[1:]:
                if not re.match(r"^[a-z0-9_]+$", record, re.I):
                    print(f"schema {record}: not a record type ID")
                    continue
                try:
                    body = netsuite("GET", f"/services/rest/record/v1/metadata-catalog/{record}", headers={"accept": "application/schema+json"})
                except RuntimeError as e:
                    print(f"schema {record}: {e}")
                    continue
                fields = [
                    {
                        "record": record,
                        "id": fid,
                        "label": p.get("title"),
                        "type": p.get("type") or ("reference" if "$ref" in p else None),
                        "format": p.get("format"),
                        "custom": p.get("x-ns-custom-field"),
                        "options": json.dumps(p["enum"][:50]) if isinstance(p.get("enum"), list) else None,
                    }
                    for fid, p in (body.get("properties") or {}).items()
                ]
                store(f"schema_{record}", fields, "schema")
                print(f"schema {record}: {len(fields)} fields ({sum(1 for f in fields if f['custom'])} custom)")
                time.sleep(PAUSE_SECONDS)
        elif cmd == "sql":
            if len(argv) < 3:
                sys.exit("sql needs a name and a query")
            max_rows = int(argv[argv.index("--max") + 1]) if "--max" in argv else None
            run_sql(argv[1], argv[2], max_rows, raw="--raw" in argv)
        else:
            sys.exit(__doc__)
    except RuntimeError as e:
        print(f"{argv[1] if cmd == 'sql' and len(argv) > 1 else cmd}: {e}")


if __name__ == "__main__":
    main(sys.argv[1:])
