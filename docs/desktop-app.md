# DH Staff Portal Mac App

The desktop app is built with Tauri and opens the live staff portal inside a macOS app shell:

```text
https://staff.dhwebsiteservices.co.uk
```

That means Microsoft sign-in, Cloudflare Pages Functions, Supabase, email flows, update prompts, and permissions use the same production portal as Safari.

## Build

```bash
npm install
npm run desktop:build:mac
```

This creates the Mac app and `.dmg`, but it does not automatically install it into Applications.

## Build And Install On This Mac

```bash
npm run desktop:install:mac
```

That command builds the app, removes any old local copy from `/Applications`, and installs the new one at:

```text
/Applications/DH Staff Portal.app
```

Open it with:

```bash
open -a "DH Staff Portal"
```

## Output Files

After a successful build, the files are here:

```text
src-tauri/target/release/bundle/macos/DH Staff Portal.app
src-tauri/target/release/bundle/dmg/DH Staff Portal_1.0.0_aarch64.dmg
```

The `.dmg` file is the file staff can download and install on a Mac.

## Install From The DMG

1. Open `DH Staff Portal_1.0.0_aarch64.dmg`.
2. Drag `DH Staff Portal` into `Applications`.
3. Open `Applications`.
4. Control-click `DH Staff Portal`.
5. Choose `Open`.
6. Confirm the macOS warning if shown.

The warning appears because this first build is not Apple-notarised yet. For wider staff rollout, the next step is Apple Developer ID signing and notarisation so macOS trusts the download normally.

## Distribution

Do not commit generated `.app` or `.dmg` files into the repo. Publish them via GitHub Releases, Cloudflare R2, or a protected internal downloads page.
