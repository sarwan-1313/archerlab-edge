# Publishing on the Microsoft Store (free)

Microsoft dropped the developer registration fee for individuals in September 2025, so ArcherLab can be listed in the Microsoft Store for Windows at no cost. The Store app is the same installable website (a PWA), so web updates reach it automatically.

## 1. Create a free developer account
1. Go to https://storedeveloper.microsoft.com and choose **Individual developer**.
2. Sign in with a Microsoft account and verify your identity (government ID plus a selfie). This is usually approved within a day or two.

## 2. Reserve the app name
In **Partner Center → Apps and games → New product → MSIX or PWA app**, reserve **ArcherLab Edge**.

Open **Product management → Product identity** and copy three values:
- **Package/Identity/Name**
- **Package/Identity/Publisher** (starts with `CN=`)
- **Publisher display name**

## 3. Package the app with PWABuilder
1. Open https://www.pwabuilder.com, enter `https://archerlab-edge.vercel.app` and press **Start**. The manifest, icons and service worker already pass.
2. Choose **Package for stores → Windows**.
3. Paste the three values from step 2, set the version to `1.0.0`, and download the package.
4. The zip holds an `.msixbundle` for the Store and a `.classic.appxbundle` for older Windows versions. Upload both.

## 4. Fill in the listing and submit
| Section | What to enter |
| --- | --- |
| Pricing | Free |
| Properties | Category: Sports. Privacy policy: `https://archerlab-edge.vercel.app/privacy` |
| Age ratings | Fill in the questionnaire: no violence, no user-to-user chat |
| Packages | Upload the files from PWABuilder |
| Store listing | Description, at least one screenshot (1366×768 or larger; the README screenshots work), and the 300×300 logo from `public/pwa/icon-512.png` |

Microsoft certifies the submission, which usually takes 1 to 3 days. After that, anyone can find ArcherLab Edge in the Store.

## Updating
- **Website changes** appear in the Store app automatically.
- **A new package** is only needed to change the name, icon or package settings: increase the version number in PWABuilder and upload again.
