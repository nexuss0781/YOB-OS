# Android Client Configuration

The Expo client is located in `apps/android`. It is a real mobile client rather than a web wrapper: its home, Play Store, installs, explicit updates, removals, wallpaper choice, app-launch flow, and publisher lifecycle controls call the same authenticated tRPC API as the web product.

Before creating an Android development or release build, set the `EXPO_PUBLIC_API_BASE_URL` environment variable to the HTTPS address of the deployed YOB-OS service. The runtime also exposes a connection field inside the Android Settings tab for development and recovery scenarios.

## Native sign-in

The backend provides a dedicated `/api/native-auth/start` and callback exchange. It validates a short-lived nonce in an HTTP-only cookie, exchanges the OAuth authorization code server-side, and redirects only to `yobos://oauth` with the app session JWT. The client stores that token only in the platform secure keychain and transmits it as a bearer credential on protected tRPC requests.

## App player restrictions

The mobile player enables JavaScript only because the uploaded package is an HTML app. It disables DOM storage, file access, universal file URL access, mixed content, and additional windows. Once the initial document response is loaded, new navigation requests are blocked. Hardware Back and the visible Exit control both leave the player and return to the YOB-OS shell.
