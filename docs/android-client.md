# Android Client Configuration

The Expo client is located in `apps/android`. It is a real mobile client rather than a web wrapper: its home, Play Store, installs, explicit updates, removals, wallpaper choice, app-launch flow, and publisher lifecycle controls call the same authenticated tRPC API as the web product.

Android builds default to `https://yob-os.vercel.app` for their authenticated tRPC API and first-party email-and-password sign-in. The runtime also exposes a connection field inside the Android Settings tab for development and recovery scenarios.

## Native sign-in

The Android client presents a local email-and-password sign-in or registration form. It calls the same first-party tRPC authentication procedures as the web app, stores only the signed session token in the platform secure keychain, and transmits that token as a bearer credential on protected tRPC requests. No browser handoff, deep-link callback, or third-party OAuth provider is used.

## App player restrictions

The mobile player enables JavaScript only because the uploaded package is an HTML app. It disables DOM storage, file access, universal file URL access, mixed content, and additional windows. Once the initial document response is loaded, new navigation requests are blocked. Hardware Back and the visible Exit control both leave the player and return to the YOB-OS shell.
