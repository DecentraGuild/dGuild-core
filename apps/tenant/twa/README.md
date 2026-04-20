# Trusted Web Activity (Bubblewrap) — dapp.dguild.org

Prerequisites: Android SDK, Java 17+, [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap) (`npm i -g @bubblewrap/cli`).

1. Ensure production serves `/manifest.webmanifest` (Netlify rewrite to `tenant_web_manifest` Edge Function) and `/.well-known/assetlinks.json` uses the real Play upload-key SHA-256.
2. Initialize once (replace launcher name as needed):

```bash
bubblewrap init --manifest https://dapp.dguild.org/manifest.webmanifest
```

Use host `dapp.dguild.org`, start URL `/` or `/discover`, HTTPS only.

3. Build:

```bash
bubblewrap build
```

4. Verify Digital Asset Links on device: install the APK, open the app; Android should verify the association. Update `assetlinks.json` with the fingerprint from Play Console (App signing certificate).

5. Upload the AAB to Play Console internal track, then complete Solana dApp Store submission using the same listing identifiers where applicable.
