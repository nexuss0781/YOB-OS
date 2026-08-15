# YOB-OS Architecture

YOB-OS is a cloud-synchronized personal application environment. The web experience is the primary control plane and launcher, while the Android client is a native companion that uses the same authenticated API contracts and account data. It is not an emulator of Windows or Android; instead, it provides a focused operating-system-like home screen for HTML applications.

## Product surfaces

| Surface          | Responsibility                                                                                         | Authentication requirement                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| YOB-OS Home      | Shows the user’s wallpaper and installed apps, reports available updates, launches or uninstalls apps. | Required                                                           |
| Play Store       | Browses searchable active listings, shows version and publisher details, installs and updates apps.    | Browsing is public; state-changing actions require sign-in.        |
| Publisher Studio | Creates, updates, deprecates, and deletes only the signed-in publisher’s listings.                     | Required                                                           |
| App Player       | Presents the selected installed HTML app in an isolated full-screen view.                              | Required and limited to a currently installed, active app version. |
| Android Client   | Mirrors Home, Play Store, player, and settings through the same tRPC API.                              | Required for personal data or lifecycle actions.                   |

## Visual direction

The interface uses a **midnight-indigo system shell** with a subtle aurora gradient and luminous, high-contrast accent colors. The home screen is intentionally spacious, with compact glass-like application tiles over user-selected wallpapers. The Play Store uses a more information-dense catalog layout while retaining the same visual tokens. This establishes a recognizable OS metaphor without copying another operating system’s visual language.

## Trust and isolation model

Uploaded applications are restricted to a **single standalone HTML document**. The server rejects non-HTML MIME types, oversized payloads, malformed metadata, and HTML documents that declare a `<base>` element. Application document bytes are stored in object storage and their metadata, version history, ownership, lifecycle status, installation state, and wallpaper preference are stored in the database.

The web player only renders a version that is associated with the signed-in user’s current installation and an active listing. It uses a sandboxed iframe with scripts, forms, modal dialogs, pointer lock, and downloads selectively enabled. The frame does not receive `allow-same-origin`, top navigation permission, camera access, microphone access, payment access, or a referrer. These restrictions prevent an uploaded app from gaining direct access to the YOB-OS shell, its session, or user-owned browser storage. The native player will use an equivalently restricted WebView configuration, including disabled JavaScript bridge access and blocked navigation away from the selected app URL.

## Synchronization model

The server is the source of truth. An installation stores the applied immutable version ID, which allows each device to determine whether a higher published version exists. Wallpaper configuration is saved as a per-user preference. Both the browser and Android application read and mutate the same tRPC procedures; local mobile persistence is only a display cache and is refreshed after successful lifecycle mutations.

## Version lifecycle

Every successful publisher upload creates an immutable version row pointing to a unique object-storage key. The newest published version becomes the listing’s current version. Users apply updates explicitly, which replaces only their installed version pointer. Deprecation removes a listing from discovery and prevents new installations while retaining existing installs for users to remove. Deletion is limited to the publisher and removes the listing from discovery and launches, while keeping unreferenced storage opaque rather than attempting physical object deletion.
