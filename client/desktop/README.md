# Duel Evolution for Windows

A Tauri v2 shell: a WebView2 (Chromium) window on https://ygoevolution.com/. The game is not bundled. The page loads
from the site with its COOP/COEP headers, as in Edge, so it runs the JSPI build. Game deploys reach desktop players
like browser players (loader.js reloads on a new `/__version`). The installer is about 2 MB and installs per user,
without an admin prompt. WebView2 comes with Windows 10/11; the installer fetches it where missing.
Windows only: Mac and Linux players use the browser.

- `splash/index.html`: the first page, bundled. It shows the update check, then checks the server is reachable
  (`/__warm`) and opens the game, or shows "Can't reach the server" with a Retry button.
- `src-tauri/src/main.rs`: the window. Links off ygoevolution.com open in the default browser. The page's own full
  screen (stage.js's button and Alt+Enter, plus F11 here) makes the window full screen. WebView2 alone keeps it
  inside the window. Size, position and maximized state are kept across launches.
- `src-tauri/tauri.conf.json`: the version, the installer and the updater (its public key and endpoint).

## Updates

Players download from https://download.ygoevolution.com/, a separate Worker (`download/`) that redirects to the
newest release's installer. At launch, behind the splash, the shell fetches `https://download.ygoevolution.com/latest.json`
(GitHub's `releases/latest/download/latest.json` if that fails), with 5 seconds for the check. If that release is
newer, it downloads the signed installer, runs it in passive mode (a progress bar, no questions) and relaunches.
This happens before the game loads, so no session is cut short. Offline or on any error, it opens the game as it is.

`releases/latest` is the repo's newest non-draft, non-prerelease release. Keep other releases drafts or
prereleases. Publishing a prerelease first and promoting it once tested is how a release goes out.

## Releasing

1. Bump `version` in `src-tauri/tauri.conf.json` (and `Cargo.toml` to match).
2. Run the `desktop` workflow (Actions tab). It publishes release `desktop-v<version>` with
   `Duel Evolution_<version>_x64-setup.exe` and `latest.json`.

The update signature uses the private key at `~/.tauri/duel-evolution-updater.key` (no password), stored as the repo
secret `TAURI_SIGNING_PRIVATE_KEY`. If it is lost, installed copies can't verify updates again: back it up.
The installer itself is not code-signed, so SmartScreen warns on first run ("More info" > "Run anyway") until it is
signed or builds reputation.

## Building locally (from Linux)

```sh
curl -sSfL https://ygoevolution.com/apple-touch-icon.png -o splash/logo.png
npx @tauri-apps/cli@2.12.4 icon splash/logo.png -o src-tauri/icons
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/duel-evolution-updater.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD= \
  npx @tauri-apps/cli@2.12.4 build --runner cargo-xwin --target x86_64-pc-windows-msvc
```

This needs `cargo-xwin`, with `clang-cl`, `lld-link`, `llvm-lib`, `llvm-rc` and `makensis` on PATH. Debian's
`nsis` and `nsis-common` packages work unpacked, with `NSISDIR` set to their `usr/share/nsis`.
