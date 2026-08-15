import Constants from "expo-constants";
import { Feather } from "@expo/vector-icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import {
  clearSessionToken,
  getSessionToken,
  registerWithPassword,
  signInWithPassword,
} from "./src/auth";
import { colors, styles } from "./src/theme";

type Tab = "home" | "store" | "settings";
type FeatherName = ComponentProps<typeof Feather>["name"];

const brandMark = require("./assets/yob-os-icon.png");
const configuredApi =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)?.replace(
    /\/$/,
    ""
  ) || "";
const wallpapers: {
  id: WallpaperId;
  label: string;
  color: string;
  icon: FeatherName;
}[] = [
  { id: "aurora", label: "Aurora", color: "#45D8FF", icon: "sun" },
  { id: "glacier", label: "Glacier", color: "#8BB9FF", icon: "wind" },
  { id: "dusk", label: "Dusk", color: "#D98DFF", icon: "moon" },
  { id: "void", label: "Void", color: "#5D6CF2", icon: "circle" },
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
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const api = useMemo(
    () => (apiBaseUrl ? createApi(apiBaseUrl, async () => token) : null),
    [apiBaseUrl, token]
  );
  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const publishedApps = await api.yob.store.list.query({});
      setStore(publishedApps);
      if (token) {
        setHome(await api.yob.home.snapshot.query());
        setPublished(await api.yob.publisher.list.query());
      } else {
        setHome(null);
        setPublished([]);
      }
    } catch (error) {
      Alert.alert(
        "Connection unavailable",
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
        "Cloud address needed",
        "Add your YOB-OS cloud address before signing in."
      );
      return null;
    }
    if (token) return token;
    setTab("home");
    return null;
  };

  const submitCredentials = async () => {
    if (!apiBaseUrl) return void (await ensureSignedIn());
    try {
      setBusy(true);
      const nextToken =
        authMode === "login"
          ? await signInWithPassword(apiBaseUrl, authEmail.trim(), authPassword)
          : await registerWithPassword(
              apiBaseUrl,
              authName.trim(),
              authEmail.trim(),
              authPassword
            );
      setToken(nextToken);
      setAuthPassword("");
      await refresh();
    } catch (error) {
      Alert.alert(
        authMode === "login" ? "Unable to sign in" : "Unable to create account",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const runMutation = async (
    work: () => Promise<void>,
    title: string,
    fallback: string
  ) => {
    try {
      setBusy(true);
      await work();
    } catch (error) {
      Alert.alert(title, error instanceof Error ? error.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const install = async (appId: string) => {
    if (!api || !(await ensureSignedIn())) return;
    await runMutation(
      async () => {
        setHome(
          (await api.yob.store.install.mutate({ appId })) as HomeSnapshot
        );
        setTab("home");
      },
      "Install unavailable",
      "Unable to install this app."
    );
  };
  const update = async (appId: string) => {
    if (!api) return;
    await runMutation(
      async () => {
        setHome((await api.yob.home.update.mutate({ appId })) as HomeSnapshot);
      },
      "Update unavailable",
      "Unable to apply the update."
    );
  };
  const uninstall = async (appId: string) => {
    if (!api) return;
    Alert.alert(
      "Remove app?",
      "The app stays available in your Play Store library.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            void runMutation(
              async () => {
                setHome(
                  (await api.yob.home.uninstall.mutate({
                    appId,
                  })) as HomeSnapshot
                );
              },
              "Removal unavailable",
              "Unable to remove this app."
            ),
        },
      ]
    );
  };
  const launch = async (appId: string) => {
    if (!api) return;
    await runMutation(
      async () => {
        setPlayer(
          (await api.yob.home.launch.query({ appId })) as LaunchPayload
        );
      },
      "Launch unavailable",
      "Unable to launch this app."
    );
  };
  const setWallpaper = async (wallpaper: WallpaperId) => {
    if (!api) return;
    await runMutation(
      async () => {
        setHome(
          (await api.yob.home.setWallpaper.mutate({
            wallpaper,
          })) as HomeSnapshot
        );
      },
      "Wallpaper unavailable",
      "Unable to save this appearance choice."
    );
  };
  const setStatus = async (appId: string, status: "deprecated" | "deleted") => {
    if (!api) return;
    await runMutation(
      async () => {
        setPublished(
          await api.yob.publisher.setStatus.mutate({ appId, status })
        );
        await refresh();
      },
      "Listing change unavailable",
      "Unable to update this listing."
    );
  };

  if (player) {
    return (
      <Player
        app={player}
        apiBaseUrl={apiBaseUrl}
        onExit={() => setPlayer(null)}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <View style={local.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setTab("home")}
            style={local.brandLockup}
          >
            <BrandMark size={42} />
            <View>
              <Text style={local.brandKicker}>YOUR PERSONAL CLOUD</Text>
              <Text style={local.brand}>YOB-OS</Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void (token ? refresh() : ensureSignedIn())}
            style={({ pressed }) => [
              local.statusPill,
              pressed && local.pressed,
              busy && local.disabled,
            ]}
          >
            <View
              style={[
                local.statusDot,
                { backgroundColor: token ? colors.mint : colors.cyan },
              ]}
            />
            <Text style={local.statusText}>
              {busy ? "Syncing" : token ? "Synced" : "Sign in"}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <LoadingState />
        ) : tab === "home" ? (
          <Home
            home={home}
            token={token}
            authMode={authMode}
            authName={authName}
            authEmail={authEmail}
            authPassword={authPassword}
            busy={busy}
            onAuthMode={setAuthMode}
            onName={setAuthName}
            onEmail={setAuthEmail}
            onPassword={setAuthPassword}
            onSignIn={() => void submitCredentials()}
            onLaunch={launch}
            onUpdate={update}
            onUninstall={uninstall}
            onWallpaper={setWallpaper}
          />
        ) : tab === "store" ? (
          <Store apps={store} busy={busy} onInstall={install} />
        ) : (
          <Settings
            apiBaseUrl={apiBaseUrl}
            setApiBaseUrl={setApiBaseUrl}
            token={token}
            published={published}
            busy={busy}
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
          <TabButton
            active={tab === "home"}
            label="Home"
            icon="grid"
            onPress={() => setTab("home")}
          />
          <TabButton
            active={tab === "store"}
            label="Discover"
            icon="compass"
            onPress={() => setTab("store")}
          />
          <TabButton
            active={tab === "settings"}
            label="Settings"
            icon="sliders"
            onPress={() => setTab("settings")}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function BrandMark({ size }: { size: number }) {
  return (
    <View
      style={[
        local.brandMarkFrame,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Image
        source={brandMark}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    </View>
  );
}

function LoadingState() {
  return (
    <View style={local.loadingWrap}>
      <BrandMark size={72} />
      <ActivityIndicator color={colors.cyan} style={{ marginTop: 22 }} />
      <Text style={local.loadingTitle}>Preparing your space</Text>
      <Text style={styles.body}>Securely connecting to your YOB-OS cloud.</Text>
    </View>
  );
}

function Home({
  home,
  token,
  authMode,
  authName,
  authEmail,
  authPassword,
  busy,
  onAuthMode,
  onName,
  onEmail,
  onPassword,
  onSignIn,
  onLaunch,
  onUpdate,
  onUninstall,
  onWallpaper,
}: {
  home: HomeSnapshot | null;
  token: string | null;
  authMode: "login" | "register";
  authName: string;
  authEmail: string;
  authPassword: string;
  busy: boolean;
  onAuthMode: (mode: "login" | "register") => void;
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSignIn: () => void;
  onLaunch: (id: string) => void;
  onUpdate: (id: string) => void;
  onUninstall: (id: string) => void;
  onWallpaper: (wallpaper: WallpaperId) => void;
}) {
  if (!token) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={local.authScroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={local.authHalo} />
          <View style={local.authCard}>
            <View style={local.authBrandRow}>
              <BrandMark size={54} />
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>PRIVATE · SYNCED · YOURS</Text>
                <Text style={local.authTitle}>A calm place for your apps.</Text>
              </View>
            </View>
            <Text style={[styles.body, { marginTop: 12 }]}>
              Sign in to carry your installed apps, releases, and visual
              preferences between web and Android.
            </Text>
            <View style={local.authModeRow}>
              <ModeButton
                active={authMode === "login"}
                label="Sign in"
                onPress={() => onAuthMode("login")}
              />
              <ModeButton
                active={authMode === "register"}
                label="Create account"
                onPress={() => onAuthMode("register")}
              />
            </View>
            {authMode === "register" && (
              <Field
                label="Name"
                icon="user"
                value={authName}
                onChangeText={onName}
                placeholder="Your name"
              />
            )}
            <Field
              label="Email"
              icon="mail"
              value={authEmail}
              onChangeText={onEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="Password"
              icon="lock"
              value={authPassword}
              onChangeText={onPassword}
              placeholder="At least 8 characters"
              secureTextEntry
            />
            <Action
              label={
                busy
                  ? "Connecting…"
                  : authMode === "login"
                    ? "Continue securely"
                    : "Create secure space"
              }
              icon="arrow-right"
              onPress={onSignIn}
              disabled={
                busy ||
                !authEmail ||
                !authPassword ||
                (authMode === "register" && !authName)
              }
              primary
              full
            />
            <View style={local.securityNote}>
              <Feather name="shield" size={14} color={colors.mint} />
              <Text style={local.securityText}>
                Your session stays protected on this device.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const wallpaper =
    wallpapers.find(item => item.id === home?.wallpaper) ?? wallpapers[0];
  return (
    <FlatList
      data={home?.apps ?? []}
      keyExtractor={item => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={local.list}
      ListHeaderComponent={
        <>
          <View style={[local.hero, { borderColor: `${wallpaper.color}66` }]}>
            <View
              style={[
                local.heroOrb,
                { backgroundColor: `${wallpaper.color}24` },
              ]}
            />
            <Text style={styles.eyebrow}>YOUR HOME SPACE</Text>
            <Text style={local.heroTitle}>
              Everything you chose,{"\n"}ready when you are.
            </Text>
            <Text style={[styles.body, { maxWidth: 280, marginTop: 10 }]}>
              Your cloud home is synchronized across devices with{" "}
              {home?.apps.length ?? 0} installed{" "}
              {home?.apps.length === 1 ? "app" : "apps"}.
            </Text>
            <View style={local.wallpaperRow}>
              {wallpapers.map(item => {
                const active = home?.wallpaper === item.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${item.label} wallpaper`}
                    key={item.id}
                    onPress={() => onWallpaper(item.id)}
                    style={({ pressed }) => [
                      local.wallpaper,
                      active && [
                        local.wallpaperActive,
                        { borderColor: item.color },
                      ],
                      pressed && local.pressed,
                    ]}
                  >
                    <View
                      style={[local.swatch, { backgroundColor: item.color }]}
                    />
                    <Text
                      style={[
                        local.wallpaperText,
                        active && { color: colors.text },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={local.sectionHeading}>
            <View>
              <Text style={styles.eyebrow}>INSTALLED</Text>
              <Text style={local.sectionTitle}>Your app shelf</Text>
            </View>
            <View style={local.countPill}>
              <Text style={local.countText}>{home?.apps.length ?? 0}</Text>
            </View>
          </View>
        </>
      }
      ListEmptyComponent={
        <View style={local.emptyState}>
          <View style={local.emptyIcon}>
            <Feather name="box" size={24} color={colors.cyan} />
          </View>
          <Text style={local.emptyTitle}>Your shelf is ready.</Text>
          <Text style={[styles.body, { textAlign: "center" }]}>
            Discover an app in the Play Store and it will appear here.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={local.appCard}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onLaunch(item.id)}
            style={({ pressed }) => [local.appMain, pressed && local.pressed]}
          >
            <AppTile value={item.icon} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={local.appName}>
                {item.name}
              </Text>
              <Text style={local.version}>
                Installed · v{item.installedVersion.version}
              </Text>
            </View>
            <Feather name="chevron-right" size={19} color={colors.subdued} />
          </Pressable>
          <View style={local.cardActions}>
            {item.canUpdate && (
              <Action
                label="Update"
                icon="download"
                onPress={() => onUpdate(item.id)}
                primary
                small
              />
            )}
            <Action
              label="Remove"
              icon="trash-2"
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
  busy,
  onInstall,
}: {
  apps: StoreApp[];
  busy: boolean;
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
      showsVerticalScrollIndicator={false}
      contentContainerStyle={local.list}
      ListHeaderComponent={
        <>
          <Text style={styles.eyebrow}>CURATED FOR YOUR CLOUD</Text>
          <Text style={[styles.title, { marginTop: 8 }]}>
            Discover new utility.
          </Text>
          <View style={local.searchWrap}>
            <Feather name="search" size={18} color={colors.subdued} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search your Play Store"
              placeholderTextColor={colors.subdued}
              style={local.searchInput}
            />
            {search ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setSearch("")}
                hitSlop={10}
              >
                <Feather name="x" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          <View style={local.storeIntro}>
            <View style={local.storeIntroIcon}>
              <Feather name="star" size={18} color={colors.mint} />
            </View>
            <Text style={local.storeIntroText}>
              {visible.length} {visible.length === 1 ? "app" : "apps"} available
              in your personal catalog
            </Text>
          </View>
        </>
      }
      renderItem={({ item }) => (
        <View style={local.storeCard}>
          <AppTile value={item.icon} large />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={local.appName}>
              {item.name}
            </Text>
            <Text style={local.version}>
              Version {item.currentVersion?.version ?? "—"}
            </Text>
            <Text numberOfLines={3} style={[styles.body, { marginTop: 9 }]}>
              {item.description}
            </Text>
            <Action
              label={busy ? "Working…" : "Install"}
              icon="download-cloud"
              onPress={() => onInstall(item.id)}
              disabled={busy}
              primary
              small
            />
          </View>
        </View>
      )}
      ListEmptyComponent={
        <View style={local.noResults}>
          <Feather name="search" size={22} color={colors.subdued} />
          <Text style={[styles.body, { marginTop: 12 }]}>
            No apps match that search.
          </Text>
        </View>
      }
    />
  );
}

function Settings({
  apiBaseUrl,
  setApiBaseUrl,
  token,
  published,
  busy,
  onSetStatus,
  onLogout,
}: {
  apiBaseUrl: string;
  setApiBaseUrl: (value: string) => void;
  token: string | null;
  published: StoreApp[];
  busy: boolean;
  onSetStatus: (appId: string, status: "deprecated" | "deleted") => void;
  onLogout: () => Promise<void>;
}) {
  return (
    <FlatList
      data={published}
      keyExtractor={item => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={local.list}
      ListHeaderComponent={
        <>
          <Text style={styles.eyebrow}>CONTROL CENTER</Text>
          <Text style={[styles.title, { marginTop: 8 }]}>
            Your cloud settings.
          </Text>
          <View style={local.connectionCard}>
            <View style={local.connectionRow}>
              <View style={local.connectionIcon}>
                <Feather name="cloud" size={20} color={colors.cyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={local.connectionTitle}>YOB-OS cloud</Text>
                <Text style={local.connectionState}>
                  {token ? "Signed in and encrypted" : "Ready to connect"}
                </Text>
              </View>
              <View style={local.livePill}>
                <View style={local.liveDot} />
                <Text style={local.liveText}>LIVE</Text>
              </View>
            </View>
            <Text style={local.fieldLabel}>Cloud service URL</Text>
            <View style={local.urlField}>
              <Feather name="link" size={17} color={colors.subdued} />
              <TextInput
                value={apiBaseUrl}
                onChangeText={setApiBaseUrl}
                placeholder="https://yob-os.vercel.app"
                placeholderTextColor={colors.subdued}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={local.urlInput}
              />
            </View>
            <Text style={local.helper}>
              Production builds use yob-os.vercel.app by default. Change this
              only for development or recovery.
            </Text>
            {token && (
              <Action
                label="Sign out from this device"
                icon="log-out"
                onPress={() => void onLogout()}
                danger
                full
              />
            )}
          </View>
          <View style={local.sectionHeading}>
            <View>
              <Text style={styles.eyebrow}>PUBLISHER SPACE</Text>
              <Text style={local.sectionTitle}>Your published apps</Text>
            </View>
            <Feather name="send" size={19} color={colors.cyan} />
          </View>
        </>
      }
      renderItem={({ item }) => (
        <View style={local.publisherCard}>
          <View style={{ flex: 1 }}>
            <Text style={local.appName}>{item.name}</Text>
            <Text style={local.version}>
              v{item.currentVersion?.version ?? "—"} · {item.status}
            </Text>
          </View>
          {item.status !== "deleted" && (
            <View style={local.cardActions}>
              <Action
                label="Deprecate"
                onPress={() => onSetStatus(item.id, "deprecated")}
                disabled={busy}
                small
              />
              <Action
                label="Delete"
                onPress={() => onSetStatus(item.id, "deleted")}
                disabled={busy}
                danger
                small
              />
            </View>
          )}
        </View>
      )}
      ListEmptyComponent={
        token ? (
          <View style={local.publisherEmpty}>
            <Feather name="pen-tool" size={21} color={colors.subdued} />
            <Text style={[styles.body, { marginTop: 10 }]}>
              Your published listings will appear here.
            </Text>
          </View>
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
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <View style={local.playerHeader}>
          <Pressable
            accessibilityRole="button"
            onPress={onExit}
            hitSlop={8}
            style={local.backButton}
          >
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={local.appName}>
              {app.name}
            </Text>
            <Text style={local.version}>Protected player · v{app.version}</Text>
          </View>
          <Action label="Exit" icon="x" onPress={onExit} small />
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
          style={{ flex: 1, backgroundColor: colors.white }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Field({
  label,
  icon,
  value,
  onChangeText,
  ...input
}: {
  label: string;
  icon: FeatherName;
  value: string;
  onChangeText: (value: string) => void;
} & Omit<React.ComponentProps<typeof TextInput>, "value" | "onChangeText">) {
  return (
    <View style={local.fieldWrap}>
      <Text style={local.fieldLabel}>{label}</Text>
      <View style={local.inputShell}>
        <Feather name={icon} size={18} color={colors.subdued} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={colors.subdued}
          style={local.authInput}
          {...input}
        />
      </View>
    </View>
  );
}

function ModeButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        local.modeButton,
        active && local.modeButtonActive,
        pressed && local.pressed,
      ]}
    >
      <Text style={[local.modeText, active && local.modeTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AppTile({ value, large = false }: { value: string; large?: boolean }) {
  return (
    <View style={[local.appTile, large && local.appTileLarge]}>
      <Text style={[local.appTileText, large && { fontSize: 26 }]}>
        {value}
      </Text>
    </View>
  );
}

function TabButton({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: FeatherName;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        local.tab,
        active && local.tabActive,
        pressed && local.pressed,
      ]}
    >
      <Feather
        name={icon}
        size={18}
        color={active ? colors.cyan : colors.subdued}
      />
      <Text style={[local.tabText, active && local.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Action({
  label,
  icon,
  onPress,
  primary = false,
  danger = false,
  small = false,
  full = false,
  disabled = false,
}: {
  label: string;
  icon?: FeatherName;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  small?: boolean;
  full?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        local.action,
        primary && local.actionPrimary,
        danger && local.actionDanger,
        small && local.actionSmall,
        full && local.actionFull,
        disabled && local.disabled,
        pressed && !disabled && local.pressed,
      ]}
    >
      {icon && (
        <Feather
          name={icon}
          size={small ? 14 : 16}
          color={primary ? colors.ink : danger ? colors.danger : colors.text}
        />
      )}
      <Text
        style={[
          local.actionText,
          primary && { color: colors.ink },
          danger && { color: colors.danger },
          small && local.actionTextSmall,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  header: {
    height: 76,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
  },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMarkFrame: {
    overflow: "hidden",
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  brandKicker: {
    color: colors.subdued,
    fontSize: 8,
    letterSpacing: 1.25,
    fontWeight: "800",
  },
  brand: {
    color: colors.text,
    fontSize: 20,
    letterSpacing: 1.5,
    lineHeight: 23,
    fontWeight: "900",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { color: colors.text, fontSize: 11, fontWeight: "800" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.48 },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 5,
  },
  list: { paddingHorizontal: 20, paddingBottom: 112, gap: 12 },
  authScroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    paddingBottom: 105,
  },
  authHalo: {
    position: "absolute",
    top: 28,
    alignSelf: "center",
    height: 230,
    width: 230,
    borderRadius: 115,
    backgroundColor: "rgba(69, 216, 255, 0.06)",
  },
  authCard: {
    ...styles.card,
    padding: 22,
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderStrong,
    overflow: "hidden",
  },
  authBrandRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  authTitle: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.3,
    fontWeight: "800",
    marginTop: 4,
  },
  authModeRow: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    marginTop: 22,
  },
  modeButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 10,
  },
  modeButtonActive: { backgroundColor: colors.surfaceRaised },
  modeText: { color: colors.subdued, fontSize: 12, fontWeight: "800" },
  modeTextActive: { color: colors.text },
  fieldWrap: { marginTop: 15 },
  fieldLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 7,
    letterSpacing: 0.25,
  },
  inputShell: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(6, 17, 31, 0.62)",
  },
  authInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 },
  securityNote: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    marginTop: 16,
  },
  securityText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  hero: {
    ...styles.card,
    padding: 21,
    marginBottom: 12,
    backgroundColor: colors.bgElevated,
    overflow: "hidden",
  },
  heroOrb: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -55,
    top: -82,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.5,
    fontWeight: "800",
    marginTop: 8,
  },
  wallpaperRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 21,
  },
  wallpaper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(5, 13, 25, 0.25)",
  },
  wallpaperActive: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1.2,
  },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  wallpaperText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    letterSpacing: -0.35,
    fontWeight: "800",
    marginTop: 3,
  },
  countPill: {
    minWidth: 30,
    alignItems: "center",
    backgroundColor: "rgba(69, 216, 255, 0.12)",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 99,
  },
  countText: { color: colors.cyan, fontSize: 12, fontWeight: "900" },
  emptyState: {
    ...styles.card,
    alignItems: "center",
    gap: 9,
    padding: 34,
    marginTop: 3,
  },
  emptyIcon: {
    alignItems: "center",
    justifyContent: "center",
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: "rgba(69, 216, 255, 0.1)",
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  appCard: { ...styles.card, padding: 14, gap: 13 },
  appMain: { flexDirection: "row", alignItems: "center", gap: 13 },
  appTile: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  appTileLarge: { width: 52, height: 52, borderRadius: 17 },
  appTileText: { color: colors.text, fontSize: 22 },
  appName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  version: {
    color: colors.subdued,
    fontSize: 11,
    marginTop: 4,
    fontWeight: "600",
  },
  cardActions: { flexDirection: "row", gap: 8 },
  action: {
    marginTop: 15,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 12,
  },
  actionPrimary: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  actionDanger: {
    borderColor: "rgba(255, 146, 162, 0.25)",
    backgroundColor: colors.dangerSurface,
  },
  actionSmall: {
    marginTop: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionFull: { alignSelf: "stretch", marginTop: 20 },
  actionText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  actionTextSmall: { fontSize: 11 },
  searchWrap: {
    marginTop: 20,
    height: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  storeIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginBottom: 8,
  },
  storeIntroIcon: {
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(98, 230, 188, 0.1)",
  },
  storeIntroText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  storeCard: { ...styles.card, flexDirection: "row", gap: 13, padding: 15 },
  noResults: { alignItems: "center", paddingTop: 44 },
  connectionCard: {
    ...styles.card,
    padding: 17,
    marginTop: 20,
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderStrong,
  },
  connectionRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  connectionIcon: {
    alignItems: "center",
    justifyContent: "center",
    height: 40,
    width: 40,
    borderRadius: 13,
    backgroundColor: "rgba(69, 216, 255, 0.1)",
  },
  connectionTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  connectionState: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 5,
    backgroundColor: "rgba(98, 230, 188, 0.1)",
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.mint,
  },
  liveText: {
    color: colors.mint,
    fontSize: 8,
    letterSpacing: 0.8,
    fontWeight: "900",
  },
  urlField: {
    height: 52,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(6, 17, 31, 0.62)",
  },
  urlInput: { flex: 1, color: colors.text, fontSize: 13, paddingVertical: 0 },
  helper: {
    color: colors.subdued,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 10,
  },
  publisherCard: {
    ...styles.card,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  publisherEmpty: {
    ...styles.card,
    alignItems: "center",
    padding: 25,
    marginTop: 4,
  },
  tabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: "rgba(6, 17, 31, 0.97)",
    borderTopWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    borderRadius: 14,
    paddingVertical: 8,
  },
  tabActive: { backgroundColor: "rgba(107, 130, 255, 0.13)" },
  tabText: { color: colors.subdued, fontSize: 10, fontWeight: "800" },
  tabTextActive: { color: colors.cyan },
  playerHeader: {
    minHeight: 68,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  backButton: {
    alignItems: "center",
    justifyContent: "center",
    height: 38,
    width: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
  },
});
