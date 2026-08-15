import { ArrowLeft, ExternalLink, ShieldCheck, X } from "lucide-react";

type PlayerApp = {
  appId: string;
  name: string;
  version: string;
  htmlUrl: string;
};

export function YobAppPlayer({
  app,
  onExit,
}: {
  app: PlayerApp;
  onExit: () => void;
}) {
  return (
    <section
      className="fixed inset-0 z-50 flex flex-col bg-[#05050d] text-white"
      aria-label={`${app.name} player`}
    >
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-black/65 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-400/15 text-violet-200">
            <ShieldCheck size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{app.name}</p>
            <p className="text-xs text-white/45">
              Sandboxed session · v{app.version}
            </p>
          </div>
        </div>
        <button
          className="yob-button yob-button-secondary"
          onClick={onExit}
          aria-label="Exit application"
        >
          <ArrowLeft size={16} />{" "}
          <span className="hidden sm:inline">Exit app</span>
          <span className="sm:hidden">Exit</span>
        </button>
      </header>
      <main className="relative min-h-0 flex-1 bg-black">
        <iframe
          title={`${app.name} app frame`}
          src={app.htmlUrl}
          className="absolute inset-0 size-full border-0 bg-white"
          sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock allow-downloads"
          referrerPolicy="no-referrer"
          allow="fullscreen; gamepad"
        />
      </main>
      <div className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-2 text-xs text-white/55 shadow-2xl backdrop-blur-md">
        <ExternalLink size={13} /> Isolated app frame <X size={13} />
      </div>
    </section>
  );
}
