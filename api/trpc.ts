import { createApp } from "../server/app.ts";

const app = createApp();

type VercelRequest = {
  url?: string;
  query?: Record<string, string | string[] | undefined>;
};

type VercelResponse = Parameters<typeof app>[1];

export default function handler(req: VercelRequest, res: VercelResponse) {
  const procedurePath = req.query?.trpcPath;
  const path = Array.isArray(procedurePath) ? procedurePath[0] : procedurePath;

  if (path) {
    const currentUrl = new URL(req.url ?? "/api/trpc", "http://localhost");
    currentUrl.searchParams.delete("trpcPath");
    req.url = `/api/trpc/${path}${currentUrl.search}`;
  }

  return app(req as Parameters<typeof app>[0], res);
}
