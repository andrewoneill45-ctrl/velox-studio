#!/bin/bash
# Usage, from the repo root:  bash tools/upload-library.sh "Cycling Training Research Library"
DIR="${1:-Cycling Training Research Library}"
KEY=$(netlify env:get HEALTH_INGEST_KEY)
if [ -z "$KEY" ]; then echo "HEALTH_INGEST_KEY not set in Netlify"; exit 1; fi
python3 - "$DIR" "$KEY" << 'PY'
import sys, os, json, urllib.request, subprocess
try:
    from pypdf import PdfReader
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "--user", "pypdf"])
    from pypdf import PdfReader
folder, key = sys.argv[1], sys.argv[2]
base = "https://velox-coach.netlify.app/api/library?key=" + key
pdfs = [f for f in sorted(os.listdir(folder)) if f.lower().endswith(".pdf")]
print(f"{len(pdfs)} PDFs in '{folder}' — extracting and distilling (one Claude call each)…")
for f in pdfs:
    try:
        r = PdfReader(os.path.join(folder, f))
        text = " ".join((p.extract_text() or "") for p in r.pages)
    except Exception as e:
        print("  SKIP", f, "-", e); continue
    if len(text) < 400:
        print("  SKIP", f, "- no extractable text (scanned image?)"); continue
    body = json.dumps({"title": os.path.splitext(f)[0], "text": text[:60000]}).encode()
    req = urllib.request.Request(base, data=body, headers={"content-type": "application/json"}, method="POST")
    try:
        out = json.loads(urllib.request.urlopen(req, timeout=180).read())
        print("  OK  ", f, "→ tags:", ",".join(out.get("tags", [])), "· quality:", out.get("quality"))
    except Exception as e:
        print("  FAIL", f, "-", e)
print("Done. The DS now reads this library in every plan and note.")
PY
