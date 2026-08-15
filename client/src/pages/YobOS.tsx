import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { YobAppPlayer } from "@/components/YobAppPlayer";
import { YobIcon } from "@/components/YobIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fileAsBase64, formatReleaseDate } from "@/lib/yob";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import {
  Archive,
  Boxes,
  Download,
  Home,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type HomeSnapshot = RouterOutputs["yob"]["home"]["snapshot"];
type StoreApp = RouterOutputs["yob"]["store"]["list"][number];
type StoreDetail = RouterOutputs["yob"]["store"]["get"];
type PublisherApp = RouterOutputs["yob"]["publisher"]["list"][number];

type Section = "home" | "store" | "studio";
type PlayerApp = {
  appId: string;
  name: string;
  version: string;
  htmlUrl: string;
};

const WALLPAPERS = [
  { id: "aurora", label: "Aurora", className: "wallpaper-aurora" },
  { id: "glacier", label: "Glacier", className: "wallpaper-glacier" },
  { id: "dusk", label: "Dusk", className: "wallpaper-dusk" },
  { id: "void", label: "Void", className: "wallpaper-void" },
] as const;

const nav = [
  { id: "home" as const, label: "Home", icon: Home },
  { id: "store" as const, label: "Play Store", icon: Store },
  { id: "studio" as const, label: "Studio", icon: Settings2 },
];

export default function YobOS() {
  const [section, setSection] = useState<Section>("home");
  const [search, setSearch] = useState("");
  const [player, setPlayer] = useState<PlayerApp | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const utils = trpc.useUtils();

  const homeQuery = trpc.yob.home.snapshot.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const storeQuery = trpc.yob.store.list.useQuery({
    search: search || undefined,
  });
  const detailQuery = trpc.yob.store.get.useQuery(
    { appId: detailId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(detailId) }
  );
  const publisherQuery = trpc.yob.publisher.list.useQuery(undefined, {
    enabled: isAuthenticated && section === "studio",
    retry: false,
  });

  const refreshPersonalState = async () => {
    await Promise.all([
      utils.yob.home.snapshot.invalidate(),
      utils.yob.publisher.list.invalidate(),
    ]);
  };
  const install = trpc.yob.store.install.useMutation({
    onSuccess: refreshPersonalState,
  });
  const update = trpc.yob.home.update.useMutation({
    onSuccess: refreshPersonalState,
  });
  const uninstall = trpc.yob.home.uninstall.useMutation({
    onSuccess: refreshPersonalState,
  });
  const setWallpaper = trpc.yob.home.setWallpaper.useMutation({
    onSuccess: refreshPersonalState,
  });
  const changeStatus = trpc.yob.publisher.setStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.yob.publisher.list.invalidate(),
        utils.yob.store.list.invalidate(),
        refreshPersonalState(),
      ]);
    },
  });

  const launch = async (appId: string) => {
    try {
      const next = await utils.yob.home.launch.fetch({ appId });
      setPlayer(next);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to launch the app."
      );
    }
  };

  const guarded = (action: () => void) => {
    if (!isAuthenticated) {
      toast.message("Sign in to manage your personal YOB-OS.");
      startLogin();
      return;
    }
    action();
  };

  return (
    <div className="min-h-screen bg-[#090914] text-white selection:bg-violet-400/40">
      <aside className="fixed inset-x-0 bottom-0 z-40 flex h-[72px] items-center justify-around border-t border-white/10 bg-[#0c0c17]/95 px-2 backdrop-blur-xl md:inset-y-0 md:left-0 md:right-auto md:h-screen md:w-[232px] md:flex-col md:justify-between md:border-r md:border-t-0 md:px-4 md:py-6">
        <div className="hidden w-full md:block">
          <div className="mb-10 flex items-center gap-3 px-2">
            <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-violet-400 to-cyan-300 text-lg font-black text-slate-950 shadow-[0_0_28px_rgba(139,92,246,.55)]">
              Y
            </span>
            <div>
              <p className="text-sm font-black tracking-[0.18em]">YOB-OS</p>
              <p className="mt-0.5 text-[10px] tracking-[0.18em] text-violet-200/55">
                PERSONAL CLOUD
              </p>
            </div>
          </div>
          <nav className="space-y-1" aria-label="Primary navigation">
            {nav.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "yob-nav-item",
                    section === item.id && "yob-nav-item-active"
                  )}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        <nav className="contents md:hidden" aria-label="Primary navigation">
          {nav.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl px-4 py-2 text-[10px] font-semibold text-white/45",
                  section === item.id && "bg-violet-400/15 text-violet-100"
                )}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="hidden w-full md:block">
          {authLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/40">
              <Loader2 size={14} className="animate-spin" />
              Checking session
            </div>
          ) : isAuthenticated ? (
            <div className="rounded-2xl border border-white/10 bg-white/[.035] p-3">
              <p className="truncate text-sm font-semibold">
                {user?.name || "YOB user"}
              </p>
              <button
                onClick={() => void logout()}
                className="mt-2 flex items-center gap-2 text-xs text-white/45 transition hover:text-white"
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          ) : (
            <Button
              onClick={startLogin}
              className="w-full rounded-xl bg-violet-300 font-bold text-slate-950 hover:bg-violet-200"
            >
              <LogIn size={16} />
              Sign in
            </Button>
          )}
        </div>
      </aside>

      <main className="min-h-screen pb-24 md:ml-[232px] md:pb-0">
        <header className="flex h-[76px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3 md:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-cyan-300 font-black text-slate-950">
              Y
            </span>
            <p className="text-sm font-black tracking-[0.13em]">YOB-OS</p>
          </div>
          <div className="hidden text-sm text-white/45 md:block">
            <span className="text-white/80">
              {section === "home"
                ? "Your space"
                : section === "store"
                  ? "Discover apps"
                  : "Publisher controls"}
            </span>{" "}
            <span className="mx-2">/</span> cloud-synced
          </div>
          <div className="flex items-center gap-3">
            {!isAuthenticated && !authLoading && (
              <button
                className="text-xs font-bold text-violet-200 hover:text-white md:hidden"
                onClick={startLogin}
              >
                Sign in
              </button>
            )}
            {isAuthenticated && (
              <span className="hidden text-xs text-white/45 sm:block">
                Signed in as{" "}
                <span className="font-semibold text-white/80">
                  {user?.name || "YOB user"}
                </span>
              </span>
            )}
            <span className="grid size-9 place-items-center rounded-full border border-emerald-300/15 bg-emerald-300/10 text-emerald-200">
              <ShieldCheck size={16} />
            </span>
          </div>
        </header>

        {section === "home" && (
          <HomeScreen
            data={homeQuery.data}
            isLoading={homeQuery.isLoading}
            isAuthenticated={isAuthenticated}
            onSignIn={startLogin}
            onLaunch={launch}
            onUpdate={appId =>
              update.mutate(
                { appId },
                { onError: error => toast.error(error.message) }
              )
            }
            onUninstall={appId =>
              uninstall.mutate(
                { appId },
                { onError: error => toast.error(error.message) }
              )
            }
            onWallpaper={wallpaper =>
              setWallpaper.mutate(
                { wallpaper },
                { onError: error => toast.error(error.message) }
              )
            }
            updateBusy={update.isPending}
            uninstallBusy={uninstall.isPending}
            wallpaperBusy={setWallpaper.isPending}
          />
        )}
        {section === "store" && (
          <StoreScreen
            apps={storeQuery.data}
            installedApps={homeQuery.data?.apps}
            detail={detailQuery.data}
            detailLoading={detailQuery.isLoading}
            selectedId={detailId}
            onDetail={setDetailId}
            onCloseDetail={() => setDetailId(null)}
            isLoading={storeQuery.isLoading}
            search={search}
            onSearch={setSearch}
            isAuthenticated={isAuthenticated}
            onInstall={appId =>
              guarded(() =>
                install.mutate(
                  { appId },
                  {
                    onSuccess: () =>
                      toast.success("App installed to your home screen."),
                    onError: error => toast.error(error.message),
                  }
                )
              )
            }
            onUpdate={appId =>
              guarded(() =>
                update.mutate(
                  { appId },
                  {
                    onSuccess: () => toast.success("Installed app updated."),
                    onError: error => toast.error(error.message),
                  }
                )
              )
            }
            installingId={
              install.isPending ? install.variables?.appId : undefined
            }
            updateId={update.isPending ? update.variables?.appId : undefined}
          />
        )}
        {section === "studio" && (
          <StudioScreen
            apps={publisherQuery.data}
            loading={publisherQuery.isLoading}
            isAuthenticated={isAuthenticated}
            onSignIn={startLogin}
            onPublish={() => {
              void publisherQuery.refetch();
              void utils.yob.store.list.invalidate();
            }}
            onSetStatus={(appId, status) =>
              changeStatus.mutate(
                { appId, status },
                {
                  onSuccess: () =>
                    toast.success(
                      status === "deprecated"
                        ? "Listing deprecated."
                        : "Listing removed from YOB-OS."
                    ),
                }
              )
            }
            busy={changeStatus.isPending}
          />
        )}
      </main>
      {player && <YobAppPlayer app={player} onExit={() => setPlayer(null)} />}
    </div>
  );
}

function HomeScreen({
  data,
  isLoading,
  isAuthenticated,
  onSignIn,
  onLaunch,
  onUpdate,
  onUninstall,
  onWallpaper,
  updateBusy,
  uninstallBusy,
  wallpaperBusy,
}: {
  data: HomeSnapshot | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  onSignIn: () => void;
  onLaunch: (id: string) => void;
  onUpdate: (id: string) => void;
  onUninstall: (id: string) => void;
  onWallpaper: (wallpaper: "aurora" | "glacier" | "dusk" | "void") => void;
  updateBusy: boolean;
  uninstallBusy: boolean;
  wallpaperBusy: boolean;
}) {
  const activeWallpaper =
    WALLPAPERS.find(wallpaper => wallpaper.id === data?.wallpaper) ??
    WALLPAPERS[0];
  if (!isAuthenticated) return <GuestHome onSignIn={onSignIn} />;
  return (
    <section className="px-4 pb-8 sm:px-8">
      <div className={cn("home-surface", activeWallpaper.className)}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_20%,rgba(255,255,255,.15),transparent_29%),linear-gradient(180deg,rgba(2,3,15,.06),rgba(2,3,15,.78))]" />
        <div className="relative flex min-h-[680px] flex-col p-5 sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.24em] text-white/55">
                YOB-OS home
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Good to see you,{" "}
                <span className="text-cyan-100">
                  {data ? "Explorer" : "there"}
                </span>
                .
              </h1>
              <p className="mt-2 max-w-md text-sm leading-6 text-white/65">
                Your apps, wallpaper, and installed versions follow your account
                across devices.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right backdrop-blur-md">
              <p className="text-2xl font-black">{data?.apps.length ?? 0}</p>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/50">
                Installed apps
              </p>
            </div>
          </div>
          <div className="mt-8 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="mr-1 shrink-0 text-[10px] font-bold uppercase tracking-[.15em] text-white/50">
              Wallpaper
            </span>
            {WALLPAPERS.map(wallpaper => (
              <button
                key={wallpaper.id}
                disabled={wallpaperBusy}
                onClick={() => onWallpaper(wallpaper.id)}
                className={cn(
                  "group flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                  activeWallpaper.id === wallpaper.id
                    ? "border-white/40 bg-white/15"
                    : "border-white/10 bg-black/10 text-white/60 hover:bg-white/10"
                )}
              >
                <span
                  className={cn("size-3 rounded-full", wallpaper.className)}
                />
                {wallpaper.label}
              </button>
            ))}
          </div>
          {isLoading ? (
            <div className="mt-14 flex flex-1 items-center justify-center">
              <Loader2 className="animate-spin text-white/45" />
            </div>
          ) : data?.apps.length ? (
            <div className="mt-12 grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 sm:gap-x-7 lg:grid-cols-5 xl:grid-cols-6">
              {data.apps.map(app => (
                <div key={app.id} className="group relative text-center">
                  <button
                    className="mx-auto block"
                    onClick={() => onLaunch(app.id)}
                  >
                    <YobIcon value={app.icon} size="md" />
                    <p className="mt-2 line-clamp-2 text-xs font-semibold text-white group-hover:text-cyan-100">
                      {app.name}
                    </p>
                  </button>
                  {app.canUpdate && (
                    <button
                      disabled={updateBusy}
                      onClick={() => onUpdate(app.id)}
                      className="mt-1 rounded-full bg-cyan-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-950"
                    >
                      Update
                    </button>
                  )}
                  <button
                    disabled={uninstallBusy}
                    onClick={() => onUninstall(app.id)}
                    className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-black/50 text-white/0 transition group-hover:text-white/60 hover:!text-rose-200"
                    aria-label={`Uninstall ${app.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyInstallState />
          )}
        </div>
      </div>
    </section>
  );
}

function GuestHome({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="px-4 pb-8 sm:px-8">
      <div className="home-surface wallpaper-aurora">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(5,5,14,.9))]" />
        <div className="relative flex min-h-[560px] max-w-xl flex-col justify-end p-7 sm:p-12">
          <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-white/15 text-cyan-100">
            <Boxes size={23} />
          </span>
          <p className="text-xs font-bold uppercase tracking-[.24em] text-cyan-100/70">
            Your personal cloud
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            One home for every HTML app you trust.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-white/65">
            Sign in to install apps, personalize your YOB-OS wallpaper, and keep
            your setup in sync on the web and Android.
          </p>
          <Button
            onClick={onSignIn}
            className="mt-7 w-fit rounded-xl bg-cyan-200 px-5 font-black text-slate-950 hover:bg-cyan-100"
          >
            <LogIn size={16} />
            Sign in to YOB-OS
          </Button>
        </div>
      </div>
    </section>
  );
}
function EmptyInstallState() {
  return (
    <div className="mt-12 flex flex-1 flex-col items-center justify-center text-center">
      <span className="grid size-16 place-items-center rounded-3xl border border-white/10 bg-black/15 text-violet-100">
        <Download size={25} />
      </span>
      <h2 className="mt-5 text-xl font-bold">Your home is ready.</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-white/55">
        Install a trusted app from the Play Store and it will appear here on
        every signed-in device.
      </p>
    </div>
  );
}

function StoreScreen({
  apps,
  installedApps,
  detail,
  detailLoading,
  selectedId,
  onDetail,
  onCloseDetail,
  isLoading,
  search,
  onSearch,
  isAuthenticated,
  onInstall,
  onUpdate,
  installingId,
  updateId,
}: {
  apps: StoreApp[] | undefined;
  installedApps: HomeSnapshot["apps"] | undefined;
  detail: StoreDetail | undefined;
  detailLoading: boolean;
  selectedId: string | null;
  onDetail: (id: string) => void;
  onCloseDetail: () => void;
  isLoading: boolean;
  search: string;
  onSearch: (value: string) => void;
  isAuthenticated: boolean;
  onInstall: (id: string) => void;
  onUpdate: (id: string) => void;
  installingId?: string;
  updateId?: string;
}) {
  return (
    <section className="px-5 pb-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="store-hero">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.22em] text-violet-200/75">
              YOB-OS Play Store
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Small apps. Your own space.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/55">
              Every published app is a versioned HTML package. Install only what
              you want on your personal home screen.
            </p>
          </div>
          <div className="mt-5 flex h-11 w-full items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 sm:mt-0 sm:w-[286px]">
            <Search size={16} className="text-white/40" />
            <Input
              value={search}
              onChange={event => onSearch(event.target.value)}
              className="h-auto border-0 bg-transparent p-0 text-sm shadow-none placeholder:text-white/35 focus-visible:ring-0"
              placeholder="Search apps"
            />
          </div>
        </div>
        <div className="mt-8 flex items-center justify-between">
          <p className="text-sm text-white/50">
            {isLoading
              ? "Searching the cloud…"
              : `${apps?.length ?? 0} published app${apps?.length === 1 ? "" : "s"}`}
          </p>
          {!isAuthenticated && (
            <p className="text-xs text-violet-200/70">Sign in to install</p>
          )}
        </div>
        {isLoading ? (
          <div className="grid min-h-72 place-items-center">
            <Loader2 className="animate-spin text-violet-200" />
          </div>
        ) : apps?.length ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {apps.map(app => {
              const installed = installedApps?.find(
                candidate => candidate.id === app.id
              );
              return (
                <article key={app.id} className="app-card">
                  <button
                    onClick={() => onDetail(app.id)}
                    className="block w-full text-left"
                  >
                    <div className="flex items-start gap-4">
                      <YobIcon value={app.icon} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold">
                          {app.name}
                        </p>
                        <p className="mt-1 text-xs text-white/40">
                          v{app.currentVersion?.version ?? "—"} · Updated{" "}
                          {app.currentVersion
                            ? formatReleaseDate(app.currentVersion.createdAt)
                            : "—"}
                        </p>
                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/60">
                          {app.description}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[.14em] text-emerald-200">
                      {installed
                        ? installed.canUpdate
                          ? "Update available"
                          : "Installed"
                        : "Verified package"}
                    </span>
                    {installed?.canUpdate ? (
                      <Button
                        onClick={() => onUpdate(app.id)}
                        disabled={updateId === app.id}
                        size="sm"
                        className="rounded-lg bg-cyan-200 text-slate-950 hover:bg-cyan-100"
                      >
                        {updateId === app.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        {updateId === app.id ? "Updating" : "Update"}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => onInstall(app.id)}
                        disabled={Boolean(installed) || installingId === app.id}
                        size="sm"
                        className="rounded-lg bg-violet-300 text-slate-950 hover:bg-violet-200"
                      >
                        {installingId === app.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                        {installed
                          ? "Installed"
                          : installingId === app.id
                            ? "Installing"
                            : "Install"}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-white/15 bg-white/[.02] py-20 text-center">
            <Store className="mx-auto text-white/25" />
            <h2 className="mt-4 font-bold">No Play Store results</h2>
            <p className="mt-2 text-sm text-white/45">
              Try a different name, or publish the first YOB app in Studio.
            </p>
          </div>
        )}
      </div>
      {selectedId && (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/65 p-4 backdrop-blur-sm sm:place-items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="App details"
            className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#121220] p-6 shadow-2xl"
          >
            {detailLoading || !detail ? (
              <div className="grid min-h-52 place-items-center">
                <Loader2 className="animate-spin text-violet-200" />
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-4">
                    <YobIcon value={detail.icon} size="lg" />
                    <div>
                      <p className="text-xl font-black">{detail.name}</p>
                      <p className="mt-1 text-xs text-white/45">
                        Version {detail.currentVersion?.version ?? "—"}
                      </p>
                    </div>
                  </div>
                  <button
                    className="text-xs font-bold text-white/45 hover:text-white"
                    onClick={onCloseDetail}
                  >
                    Close
                  </button>
                </div>
                <p className="mt-6 text-sm leading-7 text-white/65">
                  {detail.description}
                </p>
                {detail.currentVersion?.releaseNotes && (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.035] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-200/70">
                      Latest release
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/70">
                      {detail.currentVersion.releaseNotes}
                    </p>
                  </div>
                )}
                <div className="mt-6 flex justify-end">
                  <Button
                    onClick={() => onInstall(detail.id)}
                    className="rounded-xl bg-violet-300 text-slate-950 hover:bg-violet-200"
                  >
                    <Download size={15} />
                    Install to home
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function StudioScreen({
  apps,
  loading,
  isAuthenticated,
  onSignIn,
  onPublish,
  onSetStatus,
  busy,
}: {
  apps: PublisherApp[] | undefined;
  loading: boolean;
  isAuthenticated: boolean;
  onSignIn: () => void;
  onPublish: () => void;
  onSetStatus: (appId: string, status: "deprecated" | "deleted") => void;
  busy: boolean;
}) {
  const [showCreate, setShowCreate] = useState(false);
  if (!isAuthenticated)
    return (
      <section className="px-5 py-16 text-center">
        <Settings2 className="mx-auto text-violet-200" />
        <h1 className="mt-4 text-3xl font-black">Build for YOB-OS</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/55">
          Sign in to publish standalone HTML apps, ship version updates, and
          manage your Play Store listings.
        </p>
        <Button
          className="mt-6 rounded-xl bg-violet-300 font-bold text-slate-950"
          onClick={onSignIn}
        >
          <LogIn size={16} />
          Sign in to open Studio
        </Button>
      </section>
    );
  return (
    <section className="px-5 pb-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.22em] text-violet-200/75">
              Publisher Studio
            </p>
            <h1 className="mt-3 text-3xl font-black">Ship trusted web apps.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">
              Every upload becomes an immutable HTML package. Updates remain
              opt-in for each user.
            </p>
          </div>
          <Button
            className="rounded-xl bg-cyan-200 font-bold text-slate-950 hover:bg-cyan-100"
            onClick={() => setShowCreate(value => !value)}
          >
            <Plus size={17} />
            {showCreate ? "Close publisher" : "Publish an app"}
          </Button>
        </div>
        {showCreate && (
          <PublishForm
            onPublished={() => {
              setShowCreate(false);
              onPublish();
            }}
          />
        )}
        <div className="mt-9">
          <h2 className="text-sm font-bold uppercase tracking-[.15em] text-white/50">
            Your listings
          </h2>
          {loading ? (
            <div className="grid min-h-48 place-items-center">
              <Loader2 className="animate-spin text-violet-200" />
            </div>
          ) : apps?.length ? (
            <div className="mt-4 space-y-3">
              {apps.map(app => (
                <article
                  key={app.id}
                  className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[.035] p-4 sm:flex-row sm:items-center"
                >
                  <YobIcon value={app.icon} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{app.name}</p>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          app.status === "active"
                            ? "bg-emerald-300/10 text-emerald-200"
                            : "bg-amber-200/10 text-amber-100"
                        )}
                      >
                        {app.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-white/45">
                      v{app.currentVersion?.version ?? "—"} · {app.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <VersionUploader appId={app.id} onPublished={onPublish} />
                    <Button
                      disabled={busy || app.status === "deleted"}
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
                      onClick={() => onSetStatus(app.id, "deprecated")}
                    >
                      <Archive size={14} />
                      Deprecate
                    </Button>
                    <Button
                      disabled={busy || app.status === "deleted"}
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-rose-300/15 text-rose-200 hover:bg-rose-300/10 hover:text-rose-100"
                      onClick={() => onSetStatus(app.id, "deleted")}
                    >
                      <Trash2 size={14} />
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-white/45">
              Your published apps will appear here.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PublishForm({ onPublished }: { onPublished: () => void }) {
  const utils = trpc.useUtils();
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    icon: "◈",
    version: "1.0.0",
    releaseNotes: "",
  });
  const create = trpc.yob.publisher.create.useMutation({
    onSuccess: async () => {
      toast.success("Your app is live in the Play Store.");
      await utils.yob.publisher.list.invalidate();
      onPublished();
    },
    onError: error => toast.error(error.message),
  });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return toast.error("Choose a standalone HTML file first.");
    if (file.size > 1024 * 1024)
      return toast.error("HTML packages must be 1 MiB or smaller.");
    try {
      create.mutate({ ...form, htmlBase64: await fileAsBase64(file) });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to read the package."
      );
    }
  };
  return (
    <form
      onSubmit={submit}
      className="mt-7 grid gap-4 rounded-3xl border border-cyan-200/15 bg-cyan-200/[.035] p-5 sm:grid-cols-2"
    >
      <Field label="App name">
        <Input
          required
          value={form.name}
          onChange={event => setForm({ ...form, name: event.target.value })}
          placeholder="Orbit Runner"
        />
      </Field>
      <Field label="Icon">
        <Input
          required
          value={form.icon}
          onChange={event => setForm({ ...form, icon: event.target.value })}
          maxLength={32}
          placeholder="◈"
        />
      </Field>
      <Field label="Version">
        <Input
          required
          value={form.version}
          onChange={event => setForm({ ...form, version: event.target.value })}
          placeholder="1.0.0"
        />
      </Field>
      <Field label="Standalone HTML file">
        <Input
          required
          type="file"
          accept="text/html,.html"
          onChange={event => setFile(event.target.files?.[0] ?? null)}
        />
      </Field>
      <Field label="Description" wide>
        <Textarea
          required
          value={form.description}
          onChange={event =>
            setForm({ ...form, description: event.target.value })
          }
          placeholder="What does your app do?"
        />
      </Field>
      <Field label="Release notes" wide>
        <Textarea
          value={form.releaseNotes}
          onChange={event =>
            setForm({ ...form, releaseNotes: event.target.value })
          }
          placeholder="What is included in this version?"
        />
      </Field>
      <div className="sm:col-span-2 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-white/45">
          Uploads are stored as immutable HTML packages and played in an
          isolated sandbox.
        </p>
        <Button
          type="submit"
          disabled={create.isPending}
          className="rounded-xl bg-cyan-200 font-bold text-slate-950 hover:bg-cyan-100"
        >
          {create.isPending ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Upload size={16} />
          )}
          {create.isPending ? "Publishing" : "Publish to Play Store"}
        </Button>
      </div>
    </form>
  );
}

function VersionUploader({
  appId,
  onPublished,
}: {
  appId: string;
  onPublished: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const publish = trpc.yob.publisher.publishVersion.useMutation({
    onSuccess: () => {
      toast.success("New version published. Users can choose to update.");
      setFile(null);
      setVersion("");
      setNotes("");
      onPublished();
    },
    onError: error => toast.error(error.message),
  });
  const upload = async () => {
    if (!file || !version)
      return toast.message("Choose a version and HTML package first.");
    if (file.size > 1024 * 1024)
      return toast.error("HTML packages must be 1 MiB or smaller.");
    try {
      publish.mutate({
        appId,
        version,
        releaseNotes: notes || undefined,
        htmlBase64: await fileAsBase64(file),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to read the package."
      );
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="New version"
        value={version}
        onChange={event => setVersion(event.target.value)}
        placeholder="1.0.1"
        className="h-8 w-20 text-xs"
      />
      <Input
        aria-label="Release notes"
        value={notes}
        onChange={event => setNotes(event.target.value)}
        placeholder="Notes"
        className="h-8 w-20 text-xs"
      />
      <label className="cursor-pointer rounded-lg border border-white/10 px-2 py-1.5 text-xs text-white/70 transition hover:bg-white/10">
        <input
          type="file"
          accept="text/html,.html"
          className="sr-only"
          onChange={event => setFile(event.target.files?.[0] ?? null)}
        />
        {file ? file.name : "Choose HTML"}
      </label>
      <Button
        type="button"
        disabled={publish.isPending}
        onClick={upload}
        size="sm"
        className="h-8 rounded-lg bg-violet-300 px-2 text-slate-950 hover:bg-violet-200"
      >
        {publish.isPending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <RefreshCw size={13} />
        )}
        Update
      </Button>
    </div>
  );
}
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label
      className={cn(
        "grid gap-2 text-xs font-semibold text-white/65",
        wide && "sm:col-span-2"
      )}
    >
      <span>{label}</span>
      {children}
    </label>
  );
}
