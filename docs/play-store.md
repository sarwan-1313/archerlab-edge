# Publishing on Google Play

The Play Store app is a **Trusted Web Activity (TWA)**: a small Android wrapper that opens `https://archerlab-edge.vercel.app` full screen in Chrome, with no browser bar. Every web update goes live in the app at once, with no new Play release, and camera, video analysis, offline use and Bluetooth heart rate behave exactly as on the website.

## What is already done in this repository

| Piece | Where |
| --- | --- |
| Installable web app (manifest, 192/512/maskable icons, offline service worker) | `pwa.config.ts`, [pwa.md](pwa.md) |
| Home-screen shortcuts (Score a round, Analyse a video, Live Analysis, Find a range) | `manifest.shortcuts` in `pwa.config.ts` |
| Digital Asset Links file, so Android trusts the site and hides the browser bar | `scripts/write-assetlinks.mjs`, written to `/.well-known/assetlinks.json` at build time |
| Bubblewrap config for building the Android app | [`android/twa-manifest.json`](../android/twa-manifest.json) |
| Privacy policy URL for the store listing | `https://archerlab-edge.vercel.app/privacy` |

## Steps for you

### 1. Create a Google Play developer account
Go to https://play.google.com/console/signup. There is a one-time US$25 fee, and identity verification takes a few days.

**New personal accounts must run a closed test before releasing to everyone:** at least 12 testers opted in for 14 days in a row. Start this early. Clubmates, teammates and classmates make good testers.

### 2. Build the Android app
There are two ways to build it.

**Option A, easiest (no installs):** open https://www.pwabuilder.com, enter `https://archerlab-edge.vercel.app`, choose **Package for stores → Android → Google Play**, and set:
- Package ID: `app.archerlab.edge`
- App name: ArcherLab Edge; launcher name: ArcherLab
- Version 0.4.0, version code 1

Download the zip. It contains the `.aab` to upload, a signing key, and an `assetlinks.json` showing the fingerprint. **Keep the signing key and its passwords safe:** every future update needs them.

**Option B, from this repository (needs a JDK and the Android SDK, which Bubblewrap installs for you):**

```bash
cd android
npx @bubblewrap/cli init --manifest https://archerlab-edge.vercel.app/manifest.webmanifest   # or reuse twa-manifest.json
npx @bubblewrap/cli build      # produces app-release-bundle.aab
```

Bubblewrap is run with `npx` and is not added to the app's dependencies. Only `android/twa-manifest.json` is committed; the generated project and keystore are git-ignored.

### 3. Create the app in Play Console and upload
1. In Play Console, choose **Create app**: name ArcherLab Edge, type App, Free.
2. Go to **Testing → Closed testing**, create a track, upload the `.aab`, add your 12+ testers by email and send them the opt-in link.
3. Turn on **Play App Signing** (the default).

### 4. Connect the site to the app (removes the browser bar)
In Play Console, go to **Setup → App signing** (or **App integrity**). Copy the **SHA-256 certificate fingerprint** of the *app signing key*, and also of the upload key if you want test builds to work. Then, in **Vercel → Project → Settings → Environment Variables**, add:

| Variable | Value |
| --- | --- |
| `TWA_PACKAGE_NAME` | `app.archerlab.edge` |
| `TWA_SHA256_FINGERPRINTS` | `AB:CD:…` (comma-separate several) |

Redeploy, then check that `https://archerlab-edge.vercel.app/.well-known/assetlinks.json` shows your fingerprint. Until it does, the app opens with a small browser bar at the top.

### 5. Store listing
- **Short description (80 characters):** On-device archery form analysis, scoring rounds and training tools.
- **Full description:** explain live and video form analysis, scoring with groupings and the end timer, drills, the practice log, finding ranges, and that video never leaves the phone.
- **Graphics:** a 512×512 icon (`public/pwa/icon-512.png`), a 1024×500 feature graphic, and at least 2 phone screenshots (the README screenshots work).
- **Category:** Sports. Tags: archery, training.

### 6. App content forms
Answer these from how the app works. Check them again if you switch more cloud features on.

- **Privacy policy:** `https://archerlab-edge.vercel.app/privacy`
- **Ads:** No ads.
- **Target audience:** 13 and over is simplest. Including under-13s brings in Google's Families policy, which has extra requirements.
- **Data safety:**
  - *Camera and video:* processed on the device, not collected.
  - *Approximate location:* only when "Find a range" is used, rounded to about 1 km, sent to OpenStreetMap and not stored. Declare it as collected, optional, not shared for advertising, and used for app functionality.
  - *Heart rate:* stays on the device. It is not collected.
  - *Email and name:* only if you set up accounts (Supabase). Declare them as optional and used for account management.
  - *Files in the user's own Google Drive:* sent by the user to their own account.
  - *Encryption in transit:* yes, everything uses HTTPS.
  - *Data deletion:* available on the Privacy page.
- **Content rating:** fill in the questionnaire (no violence, no user-to-user chat). It usually comes out as Everyone.

### 7. Go live
After 14 days with 12 or more testers, apply for production access in Play Console (**Dashboard → Production**). Google then reviews the app, which usually takes a few days.

## Updating
- **Website changes** reach the app automatically. No Play release is needed.
- **Only when the wrapper itself changes** (icon, name, Android version support): bump `appVersionCode` in `android/twa-manifest.json`, rebuild, and upload a new `.aab`.
