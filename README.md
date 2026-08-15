# YOB-OS

**YOB-OS** is a personal cloud operating-system experience centered on a synchronized home screen and a versioned **Play Store** for standalone HTML applications. The repository contains both the cloud-hosted web product and a native Expo Android client. Users sign in once, choose a wallpaper, install trusted HTML apps, apply updates deliberately, and launch apps in an isolated full-screen player.

## Product surfaces

| Surface          | What it provides                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web Home         | A wallpaper-based personal launcher with installed-app tiles, version-update status, uninstall controls, and a full-screen sandboxed player.                                     |
| Web Play Store   | Public discovery, searching, app details, authenticated installation, and update actions for installed applications.                                                             |
| Publisher Studio | Authenticated publishing of standalone HTML files, immutable version uploads, release notes, deprecation, and deletion from discovery.                                           |
| Android client   | A native Expo client with synchronized Home, Play Store, wallpaper, installs, updates, removals, publisher lifecycle controls, native sign-in, and a constrained WebView player. |
| Cloud API        | A tRPC backend with Manus OAuth, a relational database for metadata and personal state, and object storage for HTML package bytes.                                               |

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
| Native sign-in          | Android uses a server-mediated OAuth handoff with a short-lived nonce, a fixed `yobos://oauth` deep link, and a bearer session token kept in platform secure storage.                                                                        |

## Repository layout

```text
client/                 React web client and operating-system-style interface
server/                 tRPC routes, storage workflow, native OAuth handoff, domain service
drizzle/                MySQL/TiDB schema and reviewed migration files
shared/                 Package validation and domain constants
apps/android/           Expo Android client
docs/architecture.md    Product architecture and security design
docs/android-client.md  Android configuration and native player details
```

## Local development

The cloud project uses its managed environment variables for database access, OAuth, and S3-compatible storage. No manual server secret is committed to the repository.

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

The final validation run completed all of the following checks.

| Command or check           | Result                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`               | Web and server TypeScript checks passed.                                                                                       |
| `pnpm test`                | Nine tests passed, including a live database-and-S3 lifecycle integration test.                                                |
| `pnpm build`               | Vite and server production bundles completed successfully.                                                                     |
| `apps/android: pnpm check` | Android TypeScript check passed.                                                                                               |
| Expo Android export        | The Android bundle was generated successfully to a temporary verification directory.                                           |
| Browser smoke test         | Guest Home, responsive layout, public Play Store navigation, and search input were exercised without console or server errors. |

The integration test creates an isolated temporary user and app, publishes two HTML versions to storage, installs the first version, launches it, publishes an update, verifies update availability, applies the update, persists wallpaper selection, uninstalls the app, deprecates the listing, and cleans up the test records.

## Deployment

The production web bundle is ready for the managed cloud hosting workflow. Create a checkpoint and use the project interface’s **Publish** action to make the cloud Play Store available. After publishing, use that HTTPS address as `EXPO_PUBLIC_API_BASE_URL` when producing the Android build.
