# Deployment Secrets

These GitHub Secrets must be configured in the repository settings
(**Settings → Secrets and variables → Actions**) before the Tauri
build workflow can produce signed, auto-updatable releases.

---

## Required Secrets

| Secret name            | Description |
|------------------------|-------------|
| `TAURI_PRIVATE_KEY`    | RSA private key used by the Tauri updater to sign update bundles. Generate with `tauri signer generate`. The matching public key is embedded in `tauri.conf.json`. |
| `TAURI_KEY_PASSWORD`   | Passphrase that protects `TAURI_PRIVATE_KEY`. Leave empty if the key was generated without a password. |

## Auto-provided by GitHub Actions

| Name            | Description |
|-----------------|-------------|
| `GITHUB_TOKEN`  | Automatically injected by GitHub Actions on every run. Used by the Tauri release action to upload installers and update manifests to GitHub Releases. No manual setup required. |

---

## Optional / Future Secrets

| Secret name                  | Description |
|------------------------------|-------------|
| `APPLE_CERTIFICATE`          | Base64-encoded Apple Developer certificate (`.p12`) for macOS code signing. |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` certificate. |
| `APPLE_SIGNING_IDENTITY`     | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID`                   | Apple ID email for notarization. |
| `APPLE_PASSWORD`             | App-specific password for notarization. |
| `APPLE_TEAM_ID`              | Apple Developer Team ID. |
| `WINDOWS_CERTIFICATE`        | Base64-encoded Windows code signing certificate (`.pfx`). |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the `.pfx` certificate. |

---

## Runtime environment variables (NOT secrets)

These are **not** build secrets — they are runtime configuration for the
packaged app. They should be baked into the Tauri app's environment or
read from a local config file, **not** stored in GitHub Secrets.

| Variable        | Description |
|-----------------|-------------|
| `DATABASE_URL`  | PostgreSQL connection string for the bundled API server. |
| `NODE_ENV`      | Set to `production` in the packaged build. |
| `PORT`          | API server port — set by the Tauri sidecar launcher, not GitHub Actions. |

---

## Generating the Tauri signing key

```bash
# Install Tauri CLI if not already installed
cargo install tauri-cli

# Generate a new keypair
tauri signer generate -w ~/.tauri/slalomstream.key

# The command prints:
#   Your private key: <paste this into TAURI_PRIVATE_KEY>
#   Your public key:  <paste this into tauri.conf.json updater.pubkey>
```
