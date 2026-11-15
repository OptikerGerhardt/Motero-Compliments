#!/usr/bin/env python3
"""Run the packaged plugin in a new, disposable Zotero Desktop profile.

Usage: python3 scripts/test-zotero.py /absolute/path/to/zotero
No personal profile, account, documents or library are accessed.
"""
import argparse
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
import zlib

ROOT = Path(__file__).resolve().parents[1]


def fixture(path, rich=False):
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    image_id = None
    if rich:
        # RGB image + soft mask exercise PDF.js image/group rendering, unlike
        # the original text-only fixture. Entirely synthetic, no external files.
        rgb = bytes(v for y in range(96) for x in range(96) for v in (60 + x, 80 + y, 120))
        alpha = bytes(80 + (x+y) % 176 for y in range(96) for x in range(96))
        image_id = len(objects) + 1
        mask_id = image_id + 1
        for raw, color, mask in [(rgb, '/DeviceRGB', f' /SMask {mask_id} 0 R'), (alpha, '/DeviceGray', '')]:
            packed = zlib.compress(raw)
            objects.append(f"<< /Type /XObject /Subtype /Image /Width 96 /Height 96 /ColorSpace {color} /BitsPerComponent 8 /Filter /FlateDecode /Length {len(packed)}{mask} >>\nstream\n".encode() + packed + b"\nendstream")
    kids = []
    for i in range(64 if rich else 6):
        page_id, stream_id = len(objects) + 1, len(objects) + 2
        kids.append(f"{page_id} 0 R")
        origin = 20 if i == 4 else 0
        rotation = 90 if i == 5 else 0
        x = (80 if i % 2 == 0 else 110) + origin
        lines = [f"BT /F1 10 Tf {x} 750 Td (Running chapter header) Tj ET"]
        for y in range(170, 700, 24):
            lines.append(f"BT /F1 12 Tf {x} {y} Td (Synthetic reading content for Zotero crop tests.) Tj ET")
        lines += [f"BT /F1 9 Tf 300 70 Td ({i + 1}) Tj ET", f"0 g {x} 135 250 10 re f"]
        lines.append("BT /F1 8 Tf 530 430 Td (A 123) Tj ET")
        if rich:
            lines.append("q .8 0 0 .8 0 0 cm 100 0 0 100 200 300 cm /Scan Do Q")
        stream = "\n".join(lines).encode()
        images = f" /XObject << /Scan {image_id} 0 R >>" if rich else ""
        objects += [f"<< /Type /Page /Parent 2 0 R /MediaBox [{origin} 0 {600 + origin} 800] /Rotate {rotation} /Resources << /Font << /F1 3 0 R >>{images} >> /Contents {stream_id} 0 R >>".encode(),
                    f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream"]
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>".encode()
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('binary', type=Path)
    parser.add_argument('--upgrade-from', type=Path, help='Install an older XPI and test Zotero\'s published update feed first')
    parser.add_argument('--ca-cert', type=Path, action='append', default=[], help='Import a trusted local CA into the disposable profile only')
    parser.add_argument('--rich-pdf', action='store_true', help='Use 64 synthetic pages with image soft masks')
    parser.add_argument('--pdf', type=Path, help='Private local PDF; runs the no-screenshot document smoke test')
    parser.add_argument('--xpi', type=Path, help='Test a specific artifact without checking for updates')
    args = parser.parse_args()
    binary = args.binary.resolve()
    runtime = Path(tempfile.mkdtemp(prefix="motero-zotero-test-"))
    profile = runtime / "profile"
    extensions = profile / "extensions"
    extensions.mkdir(parents=True)
    data = runtime / "data"
    data.mkdir()
    pdf = runtime / "fixture.pdf"
    if args.pdf:
        shutil.copyfile(args.pdf, pdf)
    else:
        fixture(pdf, rich=args.rich_pdf)
    version = json.loads((ROOT / 'package.json').read_text())["version"]
    xpi = args.upgrade_from or args.xpi or ROOT / f"dist/motero-compliments-{version}.xpi"
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
    js = (ROOT / ("test/zotero-document-smoke.js" if args.pdf else "test/zotero-integration.js")).read_text()
    (harness / "run.js").write_text("var TEST_ROOT=" + json.dumps(str(runtime)) + ";\n"
        + "var TEST_EXPECTED_VERSION=" + json.dumps(version) + ";\n"
        + "var TEST_CHECK_UPDATES=" + json.dumps(bool(args.upgrade_from)) + ";\n" + js)
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
    if args.ca_cert:
        subprocess.run(['certutil', '-N', '--empty-password', '-d', f'sql:{profile}'], check=True)
        for index, cert in enumerate(args.ca_cert):
            subprocess.run(['certutil', '-A', '-d', f'sql:{profile}', '-n', f'test-ca-{index}',
                '-t', 'C,,', '-i', str(cert.resolve())], check=True)
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
