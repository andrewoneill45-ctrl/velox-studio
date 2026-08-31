#!/bin/bash
DIR="${1:-Cycling Training Research Library}"
KEY=$(netlify env:get HEALTH_INGEST_KEY)
if [ -z "$KEY" ]; then echo "HEALTH_INGEST_KEY not set"; exit 1; fi
python3 - "$DIR" "$KEY" << 'PY'
import sys, os, json, urllib.request, subprocess, re
def need(mod, pkg=None):
    try: return __import__(mod)
    except ImportError:
        subprocess.check_call([sys.executable,"-m","pip","install","--quiet","--user",pkg or mod])
        return __import__(mod)
folder, key = sys.argv[1], sys.argv[2]
base = "https://velox-coach.netlify.app/api/library?key=" + key
SKIP = re.compile(r"README|MANIFEST|RESEARCH_INDEX", re.I)
files = []
for root, _, names in os.walk(folder):
    for n in names:
        if n.startswith(".") or SKIP.search(n): continue
        if n.lower().endswith((".pdf", ".docx", ".txt", ".md")):
            files.append(os.path.join(root, n))
files.sort()
print(f"{len(files)} documents found (recursive)")
for path in files:
    name = os.path.splitext(os.path.basename(path))[0]
    text = ""
    try:
        if path.lower().endswith(".pdf"):
            PdfReader = need("pypdf").PdfReader
            text = " ".join((p.extract_text() or "") for p in PdfReader(path).pages)
        elif path.lower().endswith(".docx"):
            docx = need("docx", "python-docx")
            text = "\n".join(p.text for p in docx.Document(path).paragraphs)
        else:
            text = open(path, encoding="utf-8", errors="ignore").read()
    except Exception as e:
        print("  SKIP", name, "-", e); continue
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) < 400:
        print("  SKIP", name, "- too little text"); continue
    body = json.dumps({"title": name, "text": text[:60000]}).encode()
    req = urllib.request.Request(base, data=body, headers={"content-type": "application/json"}, method="POST")
    try:
        out = json.loads(urllib.request.urlopen(req, timeout=180).read())
        print("  OK  ", name, "→", ",".join(out.get("tags", [])), "·", out.get("quality"))
    except Exception as e:
        print("  FAIL", name, "-", e)
print("Done.")
PY
