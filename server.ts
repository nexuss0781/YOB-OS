import { createApp } from "./server/app";

// Vercel detects a root-level `server.ts` and uses this default export as the
// Express function. Local development continues to use server/_core/index.ts.
export default createApp();
