# Publishing to the TV and phone stores

All TV apps open the hosted TV app at your Worker's URL (`https://tv.yourdomain.com/`). Deploy the API first (see the README), then build each package.

## Samsung Smart TV (Tizen): Samsung Apps TV

1. Register at **Samsung Apps TV Seller Office** (seller.samsungapps.com/tv) and request a partnership. Samsung reviews new partners.
2. Install **Tizen Studio** with the *TV Extensions* and *Samsung Certificate Extension*. Create a **Samsung** certificate profile: an author certificate plus a distributor certificate at *Partner* level.
3. Put the 10-character package id Seller Office gives you into `platforms/tizen/config.xml` (`CuratoTV01` is a placeholder).
4. Build:

   ```bash
   CURATO_APP_URL=https://tv.yourdomain.com/ pnpm package:tizen
   ```

   ```bash
   tizen package -t wgt -s <your-cert-profile> -- platforms/out/tizen
   ```

5. Test on a real TV in Developer Mode: Apps → type 12345 → enter your PC's IP. Use `sdb connect <tv-ip>`, then `tizen install`.
6. Upload the `.wgt` in Seller Office with screenshots (1920×1080), a 512×512 icon (`platforms/tizen/icon.png`) and a description. Expect **pre-launch testing by Samsung** (about 2–4 weeks) and feedback on remote navigation.

Supported: 2018+ TVs (Tizen 4.0+).

## LG Smart TV (webOS): LG Content Store

1. Create an account at **LG Seller Lounge** (seller.lgappstv.com) and register as a seller.
2. Install the **webOS TV CLI** (`ares-*` tools).
3. Build:

   ```bash
   CURATO_APP_URL=https://tv.yourdomain.com/ pnpm package:webos
   ```

   ```bash
   ares-package platforms/out/webos -o platforms/out
   ```

4. Test on a TV in Developer Mode: install the "Developer Mode" app from the LG Content Store, then `ares-setup-device` and `ares-install`.
5. Submit the `.ipk` with icons (80×80, 130×130), a 1920×1080 background and screenshots. LG runs a QA review that includes the Back key: it must exit from the first screen, which Curato does.

Supported: 2018+ TVs (webOS 4.0+).

## Hisense and Toshiba (VIDAA): VIDAA Store

VIDAA apps are hosted HTML5 apps: you give VIDAA the URL of your app, not a package file. The Curato TV app already works this way, so there's nothing to build. Submit `https://tv.yourdomain.com/?platform=vidaa`.

1. **Test on your own TV first.** Open the TV's built-in **Browser** app (on most VIDAA models: Home → Apps → Browser) and go to `https://tv.yourdomain.com/?platform=vidaa`. Check pairing, D-pad navigation, the Back key and video playback. Behaviour in the browser is close to, but not exactly the same as, a store-installed app.
2. **Apply to the VIDAA partner program.** VIDAA's store is not open self-service like Google Play. Apply through VIDAA's partner/developer contact on vidaa.com and expect a business review. Check vidaa.com for the current process; it changes.
3. Once accepted, VIDAA gives you the app submission requirements: icon sizes, a hosted URL and a certification test pass on their devices. Curato already exits on Back from its first screen and supports the standard media keys, which TV certifications usually check.

Supported: VIDAA U4 and newer. Older VIDAA browser engines are untested.

## Android TV and Google TV: Google Play

1. Install Android Studio (Ladybug or newer) and open `platforms/android-tv`.
2. Build a signed release bundle:

   ```bash
   cd platforms/android-tv
   ```

   ```bash
   ./gradlew bundleRelease -PcuratoAppUrl=https://tv.yourdomain.com/
   ```

   Configure signing in `app/build.gradle.kts` or through Play App Signing.
3. In Play Console:
   - Create the app.
   - Under **Advanced settings → Form factors**, add **Android TV**.
   - Upload the 1280×720 TV banner (`platforms/android-tv/store/play-feature-banner-1280x720.png`) and TV screenshots.
4. Play reviews TV apps separately against the TV app quality checklist: D-pad navigation everywhere, a launcher banner, no touch requirement and no portrait screens. All of these are covered.
5. Play's WebView policy: the app must offer more than wrapping a website. Curato's case is the pairing, parental controls and native Back/remote handling, and the site is your own.

## Fire TV: Amazon Appstore

1. Create an Amazon Developer account (developer.amazon.com).
2. Build an APK (`./gradlew assembleRelease -PcuratoAppUrl=…`). The same code works because the manifest marks leanback as *not required*, which Amazon requires.
3. On the submission form, select Fire TV devices. Amazon tests D-pad navigation and the Back key.
4. Test with `adb connect <firetv-ip>` and `adb install`. Turn on Developer Options: Settings → My Fire TV → About → click the device name 7 times.

## Phone app: App Store and Google Play

The Expo app uses **EAS Build**:

```bash
cd apps/mobile
```

```bash
npx eas-cli build --platform all
```

```bash
npx eas-cli submit --platform ios
```

```bash
npx eas-cli submit --platform android
```

- Set `extra.apiBaseUrl` in `app.json` to your API URL.
- Apple: in App Review notes, explain the app manages parental filters for TVs and plays no video itself. Provide a demo TV pairing video if asked.
- Both stores need a privacy policy URL. It must mention YouTube API Services and link to Google's privacy policy.

## Apple TV and Roku

Not supported in v1. See [ARCHITECTURE.md → Known limitations](ARCHITECTURE.md#known-limitations-and-next-steps).
