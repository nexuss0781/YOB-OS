import type { Request, Response } from "express";
import { createApp } from "./app";

const app = createApp();

type VercelRequest = Request & {
  query?: Record<string, string | string[] | undefined>;
};

export default function handler(req: VercelRequest, res: Response) {
  const procedurePath = req.query?.trpcPath;
  const path = Array.isArray(procedurePath) ? procedurePath[0] : procedurePath;

  if (path) {
    const currentUrl = new URL(req.url ?? "/api/trpc", "http://localhost");
    currentUrl.searchParams.delete("trpcPath");
    req.url = `/api/trpc/${path}${currentUrl.search}`;
  }

  return app(req, res);
}
