# Android Client Configuration

The Expo client is located in `apps/android`. It is a real mobile client rather than a web wrapper: its home, Play Store, installs, explicit updates, removals, wallpaper choice, app-launch flow, and publisher lifecycle controls call the same authenticated tRPC API as the web product.

Android builds default to `https://yob-os.vercel.app` for their authenticated tRPC API and first-party email-and-password sign-in. The runtime also exposes a connection field inside the Android Settings tab for development and recovery scenarios.

## Native sign-in

The Android client presents a local email-and-password sign-in or registration form. It calls the same first-party tRPC authentication procedures as the web app, stores only the signed session token in the platform secure keychain, and transmits that token as a bearer credential on protected tRPC requests. No browser handoff, deep-link callback, or third-party OAuth provider is used.

## Branded Android releases

The Android app now includes the original YOB-OS orbital mark as its launcher icon, adaptive icon, and launch-screen asset. The `production-apk` EAS profile creates a signed internal-distribution APK for direct installation, while the `play-store` profile creates an Android App Bundle for store distribution.

An Android "unknown app" or "install from this source" prompt is controlled by the device operating system whenever an APK is installed outside Google Play. A valid signing key, package name, and release build make the APK authentic and upgradeable, but cannot suppress that OS-level sideload warning. To remove the warning for end users, submit the signed `play-store` App Bundle through Google Play Console and distribute through an internal, closed, or production testing track.

## App player restrictions

The mobile player enables JavaScript only because the uploaded package is an HTML app. It disables DOM storage, file access, universal file URL access, mixed content, and additional windows. Once the initial document response is loaded, new navigation requests are blocked. Hardware Back and the visible Exit control both leave the player and return to the YOB-OS shell.
