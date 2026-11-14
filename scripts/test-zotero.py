#!/usr/bin/env python3
"""Run the packaged plugin in a new, disposable Zotero Desktop profile.

Usage: python3 scripts/test-zotero.py /absolute/path/to/zotero
No personal profile, account, documents or library are accessed.
"""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def fixture(path):
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for i in range(6):
        page_id, stream_id = len(objects) + 1, len(objects) + 2
        kids.append(f"{page_id} 0 R")
        origin = 20 if i == 4 else 0
        rotation = 90 if i == 5 else 0
        x = (80 if i % 2 == 0 else 110) + origin
        lines = [f"BT /F1 10 Tf {x} 750 Td (Running chapter header) Tj ET"]
        for y in range(170, 700, 24):
            lines.append(f"BT /F1 12 Tf {x} {y} Td (Synthetic reading content for Zotero crop tests.) Tj ET")
        lines += [f"BT /F1 9 Tf 300 70 Td ({i + 1}) Tj ET", f"0 g {x} 135 250 10 re f"]
        stream = "\n".join(lines).encode()
        objects += [f"<< /Type /Page /Parent 2 0 R /MediaBox [{origin} 0 {600 + origin} 800] /Rotate {rotation} /Resources << /Font << /F1 3 0 R >> >> /Contents {stream_id} 0 R >>".encode(),
                    f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream"]
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count 6 >>".encode()
    data = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(data)
    data.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    path.write_bytes(data)


def main():
    binary = Path(sys.argv[1]).resolve()
    runtime = Path(tempfile.mkdtemp(prefix="motero-zotero-test-"))
    profile = runtime / "profile"
    extensions = profile / "extensions"
    extensions.mkdir(parents=True)
    data = runtime / "data"
    data.mkdir()
    pdf = runtime / "fixture.pdf"
    fixture(pdf)
    version = json.loads((ROOT / 'package.json').read_text())["version"]
    xpi = ROOT / f"dist/motero-compliments-{version}.xpi"
    with zipfile.ZipFile(xpi) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        assert "motero.js" in archive.namelist()
    shutil.copyfile(xpi, extensions / (manifest["applications"]["zotero"]["id"] + ".xpi"))
    harness = runtime / "harness"
    harness.mkdir()
    test_manifest = {**manifest, "name": "Motero isolated integration tests", "applications": {"zotero": {
        **manifest["applications"]["zotero"], "id": "motero-test@local"}}}
    (harness / "manifest.json").write_text(json.dumps(test_manifest))
    (harness / "bootstrap.js").write_text('var scope=this; function install(){} function uninstall(){} function shutdown(){}\n'
        'function startup(data){Services.scriptloader.loadSubScript(data.rootURI+"run.js",scope); run();}\n')
    js = (ROOT / "test/zotero-integration.js").read_text()
    (harness / "run.js").write_text("var TEST_ROOT=" + json.dumps(str(runtime)) + ";\n" + js)
    with zipfile.ZipFile(extensions / "motero-test@local.xpi", "w") as archive:
        for file in harness.iterdir():
            archive.write(file, file.name)
    prefs = {
        "extensions.autoDisableScopes": 0, "extensions.enabledScopes": 15,
        "extensions.startupScanScopes": 15, "extensions.zotero.firstRun": False,
        "extensions.zotero.firstRun2": False, "extensions.zotero.sync.autoSync": False,
        "extensions.zotero.automaticScraperUpdates": False,
        "browser.shell.checkDefaultBrowser": False, "intl.locale.requested": "en-US",
        "app.update.enabled": False, "extensions.update.enabled": False,
        "extensions.zotero.dataDir": str(data), "extensions.zotero.useDataDir": True,
        "extensions.zotero.reportTranslationFailure": False,
    }
    (profile / "user.js").write_text("\n".join(f"user_pref({json.dumps(k)}, {json.dumps(v)});" for k, v in prefs.items()))
    result = runtime / "result.json"
    env = {**os.environ, "MOZ_HEADLESS": "1", "XDG_CACHE_HOME": str(runtime / "cache")}
    log = (runtime / "zotero.log").open("w")
    proc = subprocess.Popen([str(binary), "-headless", "-no-remote", "-profile", str(profile),
        "-datadir", str(data), "-debug-text"], stdout=log, stderr=subprocess.STDOUT, env=env,
        start_new_session=True)
    print(f"Isolated runtime: {runtime}", flush=True)
    try:
        deadline = time.monotonic() + 150
        while time.monotonic() < deadline and proc.poll() is None and not result.exists():
            time.sleep(.25)
        if not result.exists():
            raise RuntimeError(f"Zotero test did not finish; see {runtime / 'zotero.log'}")
        report = json.loads(result.read_text())
        print(json.dumps(report, indent=2))
        if not report["ok"]:
            return 1
        return 0
    finally:
        # Zotero's launcher is a shell with a child process. Stop the complete
        # test process group, including the application and its content workers.
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        if proc.poll() is None:
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
        log.close()


if __name__ == "__main__":
    sys.exit(main())
