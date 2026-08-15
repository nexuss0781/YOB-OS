# YOB-OS

**YOB-OS** is a personal cloud operating-system experience centered on a synchronized home screen and a versioned **Play Store** for standalone HTML applications. The repository contains both the cloud-hosted web product and a native Expo Android client. Users sign in once, choose a wallpaper, install trusted HTML apps, apply updates deliberately, and launch apps in an isolated full-screen player.

## Product surfaces

| Surface          | What it provides                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web Home         | A wallpaper-based personal launcher with installed-app tiles, version-update status, uninstall controls, and a full-screen sandboxed player.                                                       |
| Web Play Store   | Public discovery, searching, app details, authenticated installation, and update actions for installed applications.                                                                               |
| Publisher Studio | Authenticated publishing of standalone HTML files, immutable version uploads, release notes, deprecation, and deletion from discovery.                                                             |
| Android client   | A native Expo client with synchronized Home, Play Store, wallpaper, installs, updates, removals, publisher lifecycle controls, local email-and-password sign-in, and a constrained WebView player. |
| Cloud API        | A tRPC backend with first-party email-and-password sessions, a request-scoped Paradox encrypted SQLite database for metadata and personal state, and object storage for HTML package bytes.        |

## Core lifecycle

An authenticated publisher creates an app by uploading a standalone `.html` document, version string, icon, description, and optional release notes. The server validates the package, places the immutable package in S3-compatible storage, writes app and version metadata to the database, and publishes the listing to the Play Store.

When a user installs an app, YOB-OS writes a per-user installation record that points to the current immutable version. A future publisher upload creates a new version record and makes the installation report **Update Available** without changing the user’s installed version. The user chooses when to apply the update. Wallpaper preference and the installed-version pointer are cloud state, so the browser and Android client remain synchronized.

## Security model

> Uploaded HTML is treated as untrusted code. The YOB-OS shell never exposes its session, top-level navigation privileges, browser storage, or device bridge to an app package.

| Boundary                | Implementation                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package acceptance      | Only Base64-encoded standalone HTML documents of 1 MiB or less are accepted. The server rejects malformed Base64, incomplete documents, `<base>` elements, and meta-refresh redirects.                                                       |
| File storage            | HTML bytes are placed in object storage. The database stores only package keys, checksums, sizes, immutable versions, and application metadata.                                                                                              |
| Web player              | The iframe has a restrictive sandbox. It does **not** receive `allow-same-origin`, top navigation, camera, microphone, payment, or shell privileges. It includes a visible Exit control and sends no referrer.                               |
| Android player          | The WebView has DOM storage, local-file access, universal file access, mixed content, and additional windows disabled. New top-level navigation is blocked after initial loading, while hardware Back and the Exit control return to YOB-OS. |
| Lifecycle authorization | tRPC protected procedures enforce authentication. Publisher mutations additionally verify listing ownership.                                                                                                                                 |
| Account authentication  | Web accounts use HTTP-only signed cookies. Android collects email and password locally, stores the resulting signed session token only in platform secure storage, and sends it as a bearer credential.                                      |

## Repository layout

```text
client/                 React web client and operating-system-style interface
server/                 tRPC routes, Paradox data layer, first-party sessions, storage workflow, domain service
shared/                 Package validation and domain constants
apps/android/           Expo Android client
docs/architecture.md    Product architecture and security design
docs/android-client.md  Android configuration and native player details
```

## Local development

The cloud project uses managed environment variables for Paradox database access, signed first-party sessions, and S3-compatible storage. No manual server secret is committed to the repository. Each request pulls the latest encrypted Paradox snapshot, executes the required SQLite work, pushes writes when needed, and closes the connection; the automatic sync daemon is intentionally disabled.

```bash
pnpm install
pnpm dev
```

The Android client is independently installable and expects the deployed cloud service address at build time. Set `EXPO_PUBLIC_API_BASE_URL` to the HTTPS URL of the YOB-OS deployment, then run:

```bash
cd apps/android
pnpm install
pnpm android
```

For development recovery, the Android Settings tab also lets the user provide that cloud URL. It is preferable to define the build-time variable for a release build.

## Validation

The final validation run completed the local checks below. The Paradox credential and full cloud-lifecycle validations are intentionally network-dependent and run through `pnpm test:paradox-live`; this separate command prevents an external gateway outage from making the ordinary local test suite unreliable.

| Command or check           | Result                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`               | Web and server TypeScript checks passed.                                                                                       |
| `pnpm test`                | Nine local unit and integration tests passed; two network-dependent Paradox tests are skipped by default.                      |
| `pnpm test:paradox-live`   | Validates the Paradox API token and full publish/install/update/preference lifecycle when the external gateway is available.   |
| `pnpm build`               | Vite and server production bundles completed successfully.                                                                     |
| `apps/android: pnpm check` | Android TypeScript check passed.                                                                                               |
| Expo Android export        | The Android bundle was generated successfully to a temporary verification directory.                                           |
| Browser smoke test         | Guest Home, responsive layout, public Play Store navigation, and search input were exercised without console or server errors. |

The integration test creates an isolated temporary user and app, publishes two HTML versions to storage, installs the first version, launches it, publishes an update, verifies update availability, applies the update, persists wallpaper selection, uninstalls the app, deprecates the listing, and cleans up the test records.

## Deployment

The production web bundle is ready for the managed cloud hosting workflow. Create a checkpoint and use the project interface’s **Publish** action to make the cloud Play Store available. After publishing, use that HTTPS address as `EXPO_PUBLIC_API_BASE_URL` when producing the Android build.

### Vercel Node.js deployment

This repository includes a root-level `server.ts` that exports the Express application for Vercel and a `vercel.json` build configuration. Vercel’s Express integration deploys this application as a Node.js function, preserving the tRPC, first-party authentication, storage-proxy, and static-client routes. Use `pnpm vercel-build` as the Vercel build command; it creates the production bundle and stages the static client assets for Vercel’s CDN.

Before a Vercel production deployment, add the following values in the Vercel project’s **Settings → Environment Variables** for the Production environment. Do not commit any secret values to this repository.

| Variable                                                  | Required purpose                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `PARADOX_GATEWAY_URL`                                     | Default Paradox gateway endpoint used for request-scoped synchronization. |
| `PARADOX_API_KEY`                                         | Dedicated YOB-OS API token issued by the Paradox default gateway.         |
| `PARADOX_PASSPHRASE`                                      | Encryption passphrase required to open the YOB-OS Paradox database.       |
| `JWT_SECRET`                                              | Signs the authenticated application session.                              |
| `BUILT_IN_FORGE_API_URL`                                  | Server endpoint for S3-compatible storage operations.                     |
| `BUILT_IN_FORGE_API_KEY`                                  | Server credential for S3-compatible storage operations.                   |
| `VITE_FRONTEND_FORGE_API_URL`                             | Browser-accessible Forge endpoint used by the optional map component.     |
| `VITE_FRONTEND_FORGE_API_KEY`                             | Browser-accessible Forge credential used by the optional map component.   |
| `VITE_ANALYTICS_ENDPOINT` and `VITE_ANALYTICS_WEBSITE_ID` | Optional analytics configuration for the browser bundle.                  |

The Paradox database uses the default gateway configuration. Do not configure `PARADOX_STORAGE_CHANNEL` or `PARADOX_LOG_CHANNEL`; no custom Telegram channel is required. The standard Vercel project hostname is `https://yob-os.vercel.app`; `yob-os.vercel.com` is not a supported project address. If an additional custom domain is required, attach a domain that you own through the Vercel project domain settings. After the Vercel deployment is live, set the Android client’s `EXPO_PUBLIC_API_BASE_URL` to the resulting HTTPS address; no OAuth callback registration is required.
