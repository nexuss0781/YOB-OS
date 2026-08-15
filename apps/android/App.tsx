import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import {
  type HomeSnapshot,
  type LaunchPayload,
  type StoreApp,
  type WallpaperId,
  createApi,
} from "./src/api";
import { clearSessionToken, getSessionToken, signIn } from "./src/auth";
import { colors, styles } from "./src/theme";

type Tab = "home" | "store" | "settings";
const configuredApi =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)?.replace(
    /\/$/,
    ""
  ) || "";
const wallpapers: { id: WallpaperId; label: string; color: string }[] = [
  { id: "aurora", label: "Aurora", color: "#45d5cf" },
  { id: "glacier", label: "Glacier", color: "#8be4ff" },
  { id: "dusk", label: "Dusk", color: "#f092a4" },
  { id: "void", label: "Void", color: "#4c3d78" },
];

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(configuredApi);
  const [token, setToken] = useState<string | null>(null);
  const [home, setHome] = useState<HomeSnapshot | null>(null);
  const [store, setStore] = useState<StoreApp[]>([]);
  const [published, setPublished] = useState<StoreApp[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [player, setPlayer] = useState<LaunchPayload | null>(null);

  const api = useMemo(
    () => (apiBaseUrl ? createApi(apiBaseUrl, async () => token) : null),
    [apiBaseUrl, token]
  );
  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const published = await api.yob.store.list.query({});
      setStore(published);
      if (token) {
        setHome(await api.yob.home.snapshot.query());
        setPublished(await api.yob.publisher.list.query());
      } else setHome(null);
    } catch (error) {
      Alert.alert(
        "Cloud connection",
        error instanceof Error
          ? error.message
          : "YOB-OS could not reach the cloud service."
      );
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  useEffect(() => {
    void getSessionToken()
      .then(setToken)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ensureSignedIn = async () => {
    if (!apiBaseUrl) {
      setTab("settings");
      Alert.alert(
        "Server address needed",
        "Set your YOB-OS cloud address before signing in."
      );
      return null;
    }
    if (token) return token;
    try {
      setBusy(true);
      const nextToken = await signIn(apiBaseUrl);
      if (nextToken) setToken(nextToken);
      return nextToken;
    } catch (error) {
      Alert.alert(
        "Sign-in failed",
        error instanceof Error ? error.message : "Unable to complete sign-in."
      );
      return null;
    } finally {
      setBusy(false);
    }
  };

  const install = async (appId: string) => {
    if (!api || !(await ensureSignedIn())) return;
    try {
      setBusy(true);
      setHome((await api.yob.store.install.mutate({ appId })) as HomeSnapshot);
      setTab("home");
    } catch (error) {
      Alert.alert(
        "Install failed",
        error instanceof Error ? error.message : "Unable to install this app."
      );
    } finally {
      setBusy(false);
    }
  };
  const update = async (appId: string) => {
    if (!api) return;
    try {
      setBusy(true);
      setHome((await api.yob.home.update.mutate({ appId })) as HomeSnapshot);
    } catch (error) {
      Alert.alert(
        "Update failed",
        error instanceof Error ? error.message : "Unable to apply the update."
      );
    } finally {
      setBusy(false);
    }
  };
  const uninstall = async (appId: string) => {
    if (!api) return;
    try {
      setBusy(true);
      setHome((await api.yob.home.uninstall.mutate({ appId })) as HomeSnapshot);
    } catch (error) {
      Alert.alert(
        "Uninstall failed",
        error instanceof Error ? error.message : "Unable to uninstall this app."
      );
    } finally {
      setBusy(false);
    }
  };
  const launch = async (appId: string) => {
    if (!api) return;
    try {
      setBusy(true);
      setPlayer((await api.yob.home.launch.query({ appId })) as LaunchPayload);
    } catch (error) {
      Alert.alert(
        "Launch failed",
        error instanceof Error ? error.message : "Unable to launch this app."
      );
    } finally {
      setBusy(false);
    }
  };
  const setWallpaper = async (wallpaper: WallpaperId) => {
    if (!api) return;
    try {
      setBusy(true);
      setHome(
        (await api.yob.home.setWallpaper.mutate({ wallpaper })) as HomeSnapshot
      );
    } catch (error) {
      Alert.alert(
        "Wallpaper failed",
        error instanceof Error
          ? error.message
          : "Unable to save wallpaper preference."
      );
    } finally {
      setBusy(false);
    }
  };

  if (player)
    return (
      <Player
        app={player}
        apiBaseUrl={apiBaseUrl}
        onExit={() => setPlayer(null)}
      />
    );
  const setStatus = async (appId: string, status: "deprecated" | "deleted") => {
    if (!api) return;
    try {
      setBusy(true);
      setPublished(await api.yob.publisher.setStatus.mutate({ appId, status }));
      await refresh();
    } catch (error) {
      Alert.alert(
        "Listing change failed",
        error instanceof Error
          ? error.message
          : "Unable to change this listing."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={local.header}>
          <View>
            <Text style={styles.eyebrow}>Personal cloud</Text>
            <Text style={local.brand}>YOB-OS</Text>
          </View>
          <Pressable
            disabled={busy}
            onPress={() => void (token ? refresh() : ensureSignedIn())}
            style={local.accountButton}
          >
            <Text style={local.accountText}>
              {busy ? "Working" : token ? "Synced" : "Sign in"}
            </Text>
          </Pressable>
        </View>
        {loading ? (
          <View style={local.center}>
            <ActivityIndicator color={colors.violet} />
            <Text style={[styles.body, { marginTop: 12 }]}>
              Connecting to YOB-OS…
            </Text>
          </View>
        ) : tab === "home" ? (
          <Home
            home={home}
            token={token}
            onSignIn={() => void ensureSignedIn()}
            onLaunch={launch}
            onUpdate={update}
            onUninstall={uninstall}
            onWallpaper={setWallpaper}
          />
        ) : tab === "store" ? (
          <Store apps={store} onInstall={install} />
        ) : (
          <Settings
            apiBaseUrl={apiBaseUrl}
            setApiBaseUrl={setApiBaseUrl}
            token={token}
            published={published}
            onSetStatus={setStatus}
            onLogout={async () => {
              await clearSessionToken();
              setToken(null);
              setHome(null);
              setPublished([]);
            }}
          />
        )}
        <View style={local.tabBar}>
          {(["home", "store", "settings"] as Tab[]).map(item => (
            <Pressable
              key={item}
              onPress={() => setTab(item)}
              style={[local.tab, tab === item && local.tabActive]}
            >
              <Text
                style={[local.tabText, tab === item && local.tabTextActive]}
              >
                {item === "home"
                  ? "Home"
                  : item === "store"
                    ? "Play Store"
                    : "Settings"}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Home({
  home,
  token,
  onSignIn,
  onLaunch,
  onUpdate,
  onUninstall,
  onWallpaper,
}: {
  home: HomeSnapshot | null;
  token: string | null;
  onSignIn: () => void;
  onLaunch: (id: string) => void;
  onUpdate: (id: string) => void;
  onUninstall: (id: string) => void;
  onWallpaper: (wallpaper: WallpaperId) => void;
}) {
  if (!token)
    return (
      <View style={local.center}>
        <Text style={styles.eyebrow}>Your personal app space</Text>
        <Text style={[styles.title, { textAlign: "center", marginTop: 12 }]}>
          Sign in to bring your YOB-OS home to Android.
        </Text>
        <Text
          style={[
            styles.body,
            { textAlign: "center", marginTop: 14, maxWidth: 310 },
          ]}
        >
          Installations and wallpaper stay synchronized with your web home.
        </Text>
        <Action label="Sign in to YOB-OS" onPress={onSignIn} primary />
      </View>
    );
  const wallpaper =
    wallpapers.find(item => item.id === home?.wallpaper) ?? wallpapers[0];
  return (
    <FlatList
      data={home?.apps ?? []}
      keyExtractor={item => item.id}
      contentContainerStyle={local.list}
      ListHeaderComponent={
        <>
          <View style={[local.hero, { borderColor: wallpaper.color }]}>
            <Text style={styles.eyebrow}>YOB-OS home</Text>
            <Text style={[styles.title, { marginTop: 7 }]}>
              Your apps, in sync.
            </Text>
            <Text style={[styles.body, { marginTop: 10 }]}>
              Your selected cloud wallpaper and {home?.apps.length ?? 0}{" "}
              installed apps are ready.
            </Text>
            <View style={local.wallpapers}>
              {wallpapers.map(item => (
                <Pressable
                  key={item.id}
                  onPress={() => onWallpaper(item.id)}
                  style={[
                    local.wallpaper,
                    home?.wallpaper === item.id && { borderColor: item.color },
                  ]}
                >
                  <View
                    style={[local.swatch, { backgroundColor: item.color }]}
                  />
                  <Text style={local.wallpaperText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      }
      ListEmptyComponent={
        <View style={local.empty}>
          <Text style={local.emptyGlyph}>◈</Text>
          <Text style={local.emptyTitle}>Your home is ready.</Text>
          <Text style={[styles.body, { textAlign: "center" }]}>
            Install an app from Play Store and it will appear here.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={local.installed}>
          <Pressable
            onPress={() => onLaunch(item.id)}
            style={local.appIdentity}
          >
            <Text style={local.appIcon}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={local.appName}>{item.name}</Text>
              <Text style={local.version}>
                Installed v{item.installedVersion.version}
              </Text>
            </View>
          </Pressable>
          <View style={local.actions}>
            {item.canUpdate && (
              <Action
                label="Update"
                onPress={() => onUpdate(item.id)}
                primary
                small
              />
            )}
            <Action
              label="Remove"
              onPress={() => onUninstall(item.id)}
              danger
              small
            />
          </View>
        </View>
      )}
    />
  );
}
function Store({
  apps,
  onInstall,
}: {
  apps: StoreApp[];
  onInstall: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const visible = apps.filter(app =>
    `${app.name} ${app.description}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  return (
    <FlatList
      data={visible}
      keyExtractor={item => item.id}
      contentContainerStyle={local.list}
      ListHeaderComponent={
        <>
          <Text style={styles.eyebrow}>YOB-OS Play Store</Text>
          <Text style={[styles.title, { marginTop: 7 }]}>
            Discover HTML apps.
          </Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search the Play Store"
            placeholderTextColor="#77758e"
            style={local.search}
          />
        </>
      }
      renderItem={({ item }) => (
        <View style={local.storeCard}>
          <Text style={local.storeIcon}>{item.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={local.appName}>{item.name}</Text>
            <Text style={local.version}>
              Version {item.currentVersion?.version ?? "—"}
            </Text>
            <Text numberOfLines={3} style={[styles.body, { marginTop: 8 }]}>
              {item.description}
            </Text>
            <Action
              label="Install to home"
              onPress={() => onInstall(item.id)}
              primary
            />
          </View>
        </View>
      )}
      ListEmptyComponent={
        <Text style={[styles.body, { marginTop: 32, textAlign: "center" }]}>
          No apps found.
        </Text>
      }
    />
  );
}
function Settings({
  apiBaseUrl,
  setApiBaseUrl,
  token,
  published,
  onSetStatus,
  onLogout,
}: {
  apiBaseUrl: string;
  setApiBaseUrl: (value: string) => void;
  token: string | null;
  published: StoreApp[];
  onSetStatus: (appId: string, status: "deprecated" | "deleted") => void;
  onLogout: () => Promise<void>;
}) {
  return (
    <FlatList
      data={published}
      keyExtractor={item => item.id}
      contentContainerStyle={local.list}
      ListHeaderComponent={
        <>
          <Text style={styles.eyebrow}>Connection</Text>
          <Text style={[styles.title, { marginTop: 7 }]}>Cloud settings</Text>
          <Text style={[styles.body, { marginTop: 10 }]}>
            Set the HTTPS address of your deployed YOB-OS cloud service. The
            Android app uses the same protected tRPC API as the web experience.
          </Text>
          <TextInput
            value={apiBaseUrl}
            onChangeText={setApiBaseUrl}
            placeholder="https://your-yob-os-domain.manus.space"
            placeholderTextColor="#77758e"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[local.search, { height: 52 }]}
          />
          <Text style={[styles.body, { marginTop: 15 }]}>
            For release builds, define EXPO_PUBLIC_API_BASE_URL before building
            so this value is preconfigured.
          </Text>
          {token && (
            <Action label="Sign out" onPress={() => void onLogout()} danger />
          )}
          <Text style={[styles.eyebrow, { marginTop: 30, marginBottom: 7 }]}>
            Your Play Store listings
          </Text>
        </>
      }
      renderItem={({ item }) => (
        <View style={local.installed}>
          <Text style={local.appName}>{item.name}</Text>
          <Text style={local.version}>
            v{item.currentVersion?.version ?? "—"} · {item.status}
          </Text>
          {item.status !== "deleted" && (
            <View style={local.actions}>
              <Action
                label="Deprecate"
                onPress={() => onSetStatus(item.id, "deprecated")}
                small
              />
              <Action
                label="Delete"
                onPress={() => onSetStatus(item.id, "deleted")}
                danger
                small
              />
            </View>
          )}
        </View>
      )}
      ListEmptyComponent={
        token ? (
          <Text style={[styles.body, { marginTop: 14 }]}>
            You have no published listings yet.
          </Text>
        ) : null
      }
    />
  );
}
function Player({
  app,
  apiBaseUrl,
  onExit,
}: {
  app: LaunchPayload;
  apiBaseUrl: string;
  onExit: () => void;
}) {
  const source = app.htmlUrl.startsWith("http")
    ? app.htmlUrl
    : `${apiBaseUrl.replace(/\/$/, "")}${app.htmlUrl}`;
  const loaded = useRef(false);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onExit();
        return true;
      }
    );
    return () => subscription.remove();
  }, [onExit]);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <View style={local.playerHeader}>
          <View>
            <Text style={local.appName}>{app.name}</Text>
            <Text style={local.version}>Sandboxed · v{app.version}</Text>
          </View>
          <Action label="Exit" onPress={onExit} small />
        </View>
        <WebView
          source={{ uri: source }}
          javaScriptEnabled
          domStorageEnabled={false}
          javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never"
          originWhitelist={["https://*"]}
          onLoadEnd={() => {
            loaded.current = true;
          }}
          onShouldStartLoadWithRequest={request =>
            !loaded.current && request.navigationType === "other"
          }
          style={{ flex: 1, backgroundColor: "#ffffff" }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
function Action({
  label,
  onPress,
  primary = false,
  danger = false,
  small = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        local.action,
        primary && local.actionPrimary,
        danger && local.actionDanger,
        small && local.actionSmall,
      ]}
    >
      <Text
        style={[
          local.actionText,
          primary && { color: colors.darkText },
          danger && { color: colors.danger },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
const local = StyleSheet.create({
  header: {
    height: 72,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: 2,
  },
  accountButton: {
    borderWidth: 1,
    borderColor: "rgba(182,243,243,.22)",
    backgroundColor: "rgba(182,243,243,.10)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
  },
  accountText: { color: colors.cyan, fontSize: 12, fontWeight: "800" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  list: { paddingHorizontal: 20, paddingBottom: 100, gap: 12 },
  hero: {
    ...styles.card,
    padding: 20,
    borderWidth: 1.5,
    marginBottom: 12,
    backgroundColor: "#13122b",
  },
  wallpapers: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 },
  wallpaper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 99,
  },
  swatch: { width: 9, height: 9, borderRadius: 99 },
  wallpaperText: { color: colors.text, fontWeight: "700", fontSize: 11 },
  empty: {
    ...styles.card,
    alignItems: "center",
    gap: 9,
    padding: 34,
    marginTop: 12,
  },
  emptyGlyph: { color: colors.violet, fontSize: 34 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  installed: { ...styles.card, padding: 14, gap: 12 },
  appIdentity: { flexDirection: "row", gap: 13, alignItems: "center" },
  appIcon: {
    fontSize: 25,
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(196,181,253,.13)",
    textAlign: "center",
    textAlignVertical: "center",
  },
  appName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  version: { color: "#918fa8", fontSize: 11, marginTop: 3 },
  actions: { flexDirection: "row", gap: 8 },
  action: {
    marginTop: 14,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,.04)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  actionPrimary: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  actionDanger: {
    borderColor: "rgba(253,164,175,.20)",
    backgroundColor: "rgba(253,164,175,.07)",
  },
  actionSmall: { marginTop: 0, paddingHorizontal: 10, paddingVertical: 7 },
  actionText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  tabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(12,12,23,.98)",
    borderTopWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tab: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 15 },
  tabActive: { backgroundColor: "rgba(196,181,253,.14)" },
  tabText: { color: "#86849c", fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: colors.violet },
  search: {
    ...styles.card,
    color: colors.text,
    marginTop: 21,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 14,
  },
  storeCard: {
    ...styles.card,
    flexDirection: "row",
    gap: 14,
    padding: 15,
    marginTop: 10,
  },
  storeIcon: { fontSize: 27, color: colors.text },
  playerHeader: {
    height: 66,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#0c0c17",
  },
});
