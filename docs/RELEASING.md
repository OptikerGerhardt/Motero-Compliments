# Releases and automatic updates

Installed plugins retain the ID `motero-compliments@optikergerhardt` and request
the public `update.json` on `main`. Each entry points to a versioned GitHub
Release XPI and its exact SHA-256. Zotero uses its normal plugin update checks;
users may also select **Check for Updates** in the Plugins manager. An old 0.1.0
installation already has this feed URL, so it does not require a different ID
or a permanent reinstall process.

1. Work in a focused branch/PR linked to an issue. Update `CHANGELOG.md`,
   `package.json`, `package-lock.json` and `addon/manifest.json` to a new version.
2. Run `npm ci`, `npm test`, `npm run build`, and the isolated native Zotero test.
   Record the actual results and platform limitations in `docs/TESTING.md`.
3. After source and documentation are final, run `npm run release:prepare`.
   This rebuilds the XPI, writes its `dist/SHA256SUMS`, and adds the versioned
   download URL and checksum to `update.json`. Review and commit that manifest.
4. Push the branch, verify GitHub checks, and merge the PR. Tag that commit
   `v<version>` and publish the **exact prepared XPI**, `SHA256SUMS`, and release
   notes in a new GitHub Release. Never rebuild/replace an existing release asset.
5. Verify the public feed and downloaded asset against the checksum. Test an
   update from the previous installed version using the real Zotero updater.

Builds sort archive entries, normalize permissions and fix ZIP timestamps so
unchanged inputs produce the same artifact. The preparer refuses to reuse a
version for different bytes. `dist/` stays generated; source, manifest, changelog,
test evidence, PRs, tags and release assets provide the audit trail.

The updater is Zotero's built-in mechanism, not a plugin-created polling or
download service. It preserves Zotero's TLS and artifact-hash verification.

## Isolated upgrade check

```sh
python3 scripts/test-zotero.py /path/to/zotero \
  --upgrade-from /path/to/motero-compliments-previous.xpi
```

This creates a fresh profile, installs the old XPI, requests its actual public
feed and lets Zotero download/verify/install the new version before exercising
the reader. In a managed proxy environment, `--ca-cert /path/to/trusted-root.crt`
can import an existing trusted CA into that temporary profile only; it never
disables TLS verification or modifies a personal Zotero profile.
