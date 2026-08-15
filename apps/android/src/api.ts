import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

export type WallpaperId = "aurora" | "glacier" | "dusk" | "void";
export type StoreApp = {
  id: string;
  name: string;
  icon: string;
  description: string;
  status: "active" | "deprecated" | "deleted";
  currentVersion: {
    id: string;
    version: string;
    releaseNotes: string | null;
    createdAt: string;
  } | null;
};
export type HomeApp = StoreApp & {
  installedVersionId: string;
  installedVersion: { id: string; version: string };
  hasUpdate: boolean;
  canUpdate: boolean;
};
export type HomeSnapshot = { wallpaper: WallpaperId; apps: HomeApp[] };
export type LaunchPayload = {
  appId: string;
  name: string;
  version: string;
  htmlUrl: string;
};

export type YobApi = {
  auth: {
    mobileLogin: {
      mutate(input: { email: string; password: string }): Promise<{
        sessionToken: string;
      }>;
    };
    mobileRegister: {
      mutate(input: {
        name: string;
        email: string;
        password: string;
      }): Promise<{ sessionToken: string }>;
    };
  };
  yob: {
    store: {
      list: { query(input: { search?: string }): Promise<StoreApp[]> };
      install: { mutate(input: { appId: string }): Promise<HomeSnapshot> };
    };
    home: {
      snapshot: { query(): Promise<HomeSnapshot> };
      update: { mutate(input: { appId: string }): Promise<HomeSnapshot> };
      uninstall: { mutate(input: { appId: string }): Promise<HomeSnapshot> };
      setWallpaper: {
        mutate(input: { wallpaper: WallpaperId }): Promise<HomeSnapshot>;
      };
      launch: { query(input: { appId: string }): Promise<LaunchPayload> };
    };
    publisher: {
      list: { query(): Promise<StoreApp[]> };
      setStatus: {
        mutate(input: {
          appId: string;
          status: "deprecated" | "deleted";
        }): Promise<StoreApp[]>;
      };
    };
  };
};

export function createApi(
  apiBaseUrl: string,
  getToken: () => Promise<string | null>
): YobApi {
  const client = createTRPCProxyClient<any>({
    links: [
      httpBatchLink({
        url: `${apiBaseUrl.replace(/\/$/, "")}/api/trpc`,
        transformer: superjson,
        async headers() {
          const token = await getToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
  return client as unknown as YobApi;
}
