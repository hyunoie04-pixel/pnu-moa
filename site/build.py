"""Build site/index.html: template + college/department list (from the collector seed) + a data snapshot from the sheet.

    python site/build.py            # fetch the live sheet (public GViz) and write site/index.html
    python site/build.py --offline  # reuse site/snapshot.json + site/snapshot.meta.json (no network)
"""
import csv
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEED = HERE.parent / "collector" / "data" / "sources_seed.csv"
SHEET, GID = "1dRob98i31VTSJfGOzasqhAUHY26jyB5Tv2OrOj2ZrqE", "513454445"
NCOL = 21  # A..U
OTHER = "기타 학부·전공"
KST = timezone(timedelta(hours=9))
MIN_ROW_RATIO = 0.5  # abort if live sheet returns fewer than 50% of previous snapshot rows


def colleges():
    order, depts = [], {}
    with open(SEED, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if r["kind"] not in ("college", "dept") or not (r["college"] or r["dept"]):
                continue  # central institutions (international office, centers...) are not student affiliations
            if r["kind"] == "college":
                order.append(r["college"])
                depts.setdefault(r["college"], [])
            else:
                depts.setdefault(r["college"] or OTHER, [])
                if r["dept"] not in depts[r["college"] or OTHER]:
                    depts[r["college"] or OTHER].append(r["dept"])
    # departments that have no crawlable site of their own (still needed so every student can pick theirs)
    extra = SEED.parent / "departments_extra.csv"
    if extra.exists():
        with open(extra, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                lst = depts.setdefault(r["college"], [])
                if r["dept"] not in lst:
                    lst.append(r["dept"])
    names = order + ([OTHER] if OTHER in depts and OTHER not in order else [])
    return [{"name": n, "depts": sorted(depts.get(n, []))} for n in names]


def fetch_rows():
    url = (f"https://docs.google.com/spreadsheets/d/{SHEET}/gviz/tq?gid={GID}&range=A5:U&headers=1"
           "&tqx=responseHandler:sheetCallback")
    req = urllib.request.Request(url, headers={"User-Agent": "PNU-student-portal-build/1.0"})
    txt = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    data = json.loads(re.sub(r"(?s)^.*?sheetCallback\(|\);?\s*$", "", txt))
    if data.get("status") != "ok":
        raise SystemExit("sheet not readable: " + str(data.get("errors")))
    rows = []
    for r in data["table"]["rows"]:
        cells = r.get("c") or []
        row = []
        for i in range(NCOL):
            c = cells[i] if i < len(cells) else None
            row.append("" if not c else (c.get("f") if c.get("f") is not None else (c.get("v") if c.get("v") is not None else "")))
        if row[1]:
            rows.append([str(x) for x in row])
    return rows


def main():
    snap_path = HERE / "snapshot.json"
    meta_path = HERE / "snapshot.meta.json"
    meta_note = ""
    if "--offline" in sys.argv and snap_path.exists():
        rows = json.loads(snap_path.read_text(encoding="utf-8"))
        if not rows:
            raise SystemExit("abort: offline snapshot.json is empty (0 rows)")
        snapshot_at = ""
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                snapshot_at = str(meta.get("snapshot_at") or "").strip()
            except Exception:
                snapshot_at = ""
        if not snapshot_at:
            mtime = snap_path.stat().st_mtime
            snapshot_at = datetime.fromtimestamp(mtime, tz=KST).isoformat(timespec="seconds")
            meta_note = " (from snapshot.json mtime; snapshot.meta.json missing)"
    else:
        prev_count = 0
        if snap_path.exists():
            try:
                prev_rows = json.loads(snap_path.read_text(encoding="utf-8"))
                if isinstance(prev_rows, list):
                    prev_count = len(prev_rows)
            except Exception:
                prev_count = 0
        rows = fetch_rows()
        snapshot_at = datetime.now(KST).isoformat(timespec="seconds")
        if len(rows) == 0:
            raise SystemExit("abort: fetched 0 rows from sheet; keeping existing snapshot.json")
        if prev_count > 0 and len(rows) < prev_count * MIN_ROW_RATIO:
            raise SystemExit(
                f"abort: fetched {len(rows)} rows (< {MIN_ROW_RATIO:.0%} of previous {prev_count} rows); "
                "keeping existing snapshot.json"
            )
        snap_path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        meta_path.write_text(json.dumps({"snapshot_at": snapshot_at}, ensure_ascii=False), encoding="utf-8")
    tpl = (HERE / "template.html").read_text(encoding="utf-8")
    safe = lambda o: json.dumps(o, ensure_ascii=False).replace("</", "<\\/")
    col_list = colleges()
    html = tpl.replace("/*COLLEGES*/", "const COLLEGES=" + safe(col_list) + ";")
    html = html.replace("/*SNAPSHOT*/", "const snapshot=" + safe(rows) + ";")
    html = html.replace("/*SNAPSHOT_AT*/", "const SNAPSHOT_AT=" + safe(snapshot_at) + ";")
    rules_note = ""
    if "/*ORIGIN_RULES*/" in html:
        rules_path = HERE / "origin_rules.json"
        if not rules_path.exists():
            raise SystemExit(
                f"abort: template contains /*ORIGIN_RULES*/ but {rules_path} does not exist; keeping existing index.html"
            )
        origin_rules = json.loads(rules_path.read_text(encoding="utf-8-sig"))
        html = html.replace("/*ORIGIN_RULES*/", "const ORIGIN_RULES=" + safe(origin_rules) + ";")
        rules_note = " | origin_rules ok"
    (HERE / "index.html").write_text(html, encoding="utf-8")
    print(
        f"built site/index.html | rows {len(rows)} | snapshot_at {snapshot_at}{meta_note} "
        f"| colleges {len(col_list)}{rules_note} | bytes {len(html.encode('utf-8'))}"
    )


if __name__ == "__main__":
    main()
