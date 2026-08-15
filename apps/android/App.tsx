import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
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
  ImageBackground,
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
  type HomeApp,
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

type Tab = "home" | "explore" | "settings";
type FeatherName = ComponentProps<typeof Feather>["name"];
type PhotoMime = "image/jpeg" | "image/png" | "image/webp";

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
  accent: string;
}[] = [
  { id: "aurora", label: "Aurora", color: "#45D8FF", accent: "#122E49" },
  { id: "glacier", label: "Glacier", color: "#90B7FF", accent: "#182B50" },
  { id: "dusk", label: "Dusk", color: "#D391FF", accent: "#36224A" },
  { id: "void", label: "Void", color: "#6C7DFF", accent: "#171A42" },
];

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [home, setHome] = useState<HomeSnapshot | null>(null);
  const [store, setStore] = useState<StoreApp[]>([]);
  const [published, setPublished] = useState<StoreApp[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [player, setPlayer] = useState<LaunchPayload | null>(null);
  const [arranging, setArranging] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const api = useMemo(
    () => (configuredApi ? createApi(configuredApi, async () => token) : null),
    [token]
  );
  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const listings = await api.yob.store.list.query({});
      setStore(listings);
      if (token) {
        setHome(await api.yob.home.snapshot.query());
        setPublished(await api.yob.publisher.list.query());
      } else {
        setHome(null);
        setPublished([]);
      }
    } catch (error) {
      Alert.alert(
        "Unable to refresh",
        error instanceof Error ? error.message : "Please try again shortly."
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

  const perform = async (
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

  const submitCredentials = async () => {
    if (!configuredApi) return;
    await perform(
      async () => {
        const nextToken =
          authMode === "login"
            ? await signInWithPassword(
                configuredApi,
                authEmail.trim(),
                authPassword
              )
            : await registerWithPassword(
                configuredApi,
                authName.trim(),
                authEmail.trim(),
                authPassword
              );
        setToken(nextToken);
        setAuthPassword("");
      },
      "Unable to continue",
      "Please check your details and try again."
    );
  };

  const install = async (appId: string) => {
    if (!api || !token) {
      setTab("home");
      return;
    }
    await perform(
      async () => {
        setHome(await api.yob.store.install.mutate({ appId }));
        setTab("home");
      },
      "Install unavailable",
      "Unable to add this app right now."
    );
  };
  const launch = async (appId: string) => {
    if (!api) return;
    await perform(
      async () => {
        setPlayer(await api.yob.home.launch.query({ appId }));
      },
      "Launch unavailable",
      "Unable to open this app right now."
    );
  };
  const applyUpdate = async (appId: string) => {
    if (!api) return;
    await perform(
      async () => {
        setHome(await api.yob.home.update.mutate({ appId }));
      },
      "Update unavailable",
      "Unable to update this app right now."
    );
  };
  const uninstall = async (appId: string) => {
    if (!api) return;
    Alert.alert(
      "Remove this app?",
      "It remains available in Explore if you want it again.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            void perform(
              async () => {
                setHome(await api.yob.home.uninstall.mutate({ appId }));
              },
              "Removal unavailable",
              "Unable to remove this app right now."
            ),
        },
      ]
    );
  };
  const setWallpaper = async (wallpaper: WallpaperId) => {
    if (!api) return;
    await perform(
      async () => {
        setHome(await api.yob.home.setWallpaper.mutate({ wallpaper }));
      },
      "Appearance unavailable",
      "Unable to save this wallpaper right now."
    );
  };
  const chooseWallpaperPhoto = async () => {
    if (!api) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to use a personal wallpaper."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.82,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const photoBase64 = asset.base64;
    const mimeType = asset.mimeType;
    if (!photoBase64 || !isPhotoMime(mimeType)) {
      Alert.alert(
        "Use a supported photo",
        "Choose a JPG, PNG, or WebP image under 5 MiB."
      );
      return;
    }
    await perform(
      async () => {
        setHome(
          await api.yob.home.setWallpaperPhoto.mutate({
            base64: photoBase64,
            mimeType,
          })
        );
      },
      "Photo unavailable",
      "Unable to save this photo right now."
    );
  };
  const moveApp = async (appId: string, direction: -1 | 1) => {
    if (!api || !home) return;
    const currentIndex = home.apps.findIndex(app => app.id === appId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= home.apps.length)
      return;
    const nextApps = [...home.apps];
    const [moved] = nextApps.splice(currentIndex, 1);
    nextApps.splice(nextIndex, 0, moved);
    const previous = home;
    setHome({ ...home, apps: nextApps });
    try {
      setBusy(true);
      setHome(
        await api.yob.home.setAppOrder.mutate({
          appIds: nextApps.map(app => app.id),
        })
      );
    } catch (error) {
      setHome(previous);
      Alert.alert(
        "Arrangement unavailable",
        error instanceof Error
          ? error.message
          : "Unable to save your app order."
      );
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (appId: string, status: "deprecated" | "deleted") => {
    if (!api) return;
    await perform(
      async () => {
        setPublished(
          await api.yob.publisher.setStatus.mutate({ appId, status })
        );
        await refresh();
      },
      "Listing unavailable",
      "Unable to update this listing."
    );
  };

  if (player) {
    return <Player app={player} onExit={() => setPlayer(null)} />;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={styles.screen}
        edges={["top", "left", "right", "bottom"]}
      >
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <SystemNavigation active={tab} onChange={setTab} />
        <View style={local.content}>
          {loading ? (
            <LoadingState />
          ) : tab === "home" ? (
            <Launcher
              home={home}
              token={token}
              arranging={arranging}
              busy={busy}
              authMode={authMode}
              authName={authName}
              authEmail={authEmail}
              authPassword={authPassword}
              onAuthMode={setAuthMode}
              onName={setAuthName}
              onEmail={setAuthEmail}
              onPassword={setAuthPassword}
              onSignIn={() => void submitCredentials()}
              onLaunch={launch}
              onMove={moveApp}
              onArrange={() => setArranging(value => !value)}
              onUpdate={applyUpdate}
              onUninstall={uninstall}
            />
          ) : tab === "explore" ? (
            <Explore
              home={home}
              apps={store}
              busy={busy}
              onInstall={install}
              onWallpaper={setWallpaper}
              onChoosePhoto={chooseWallpaperPhoto}
            />
          ) : (
            <Settings
              token={token}
              published={published}
              busy={busy}
              onSetStatus={setStatus}
              onLogout={async () => {
                await clearSessionToken();
                setToken(null);
                setHome(null);
                setPublished([]);
                setTab("home");
              }}
            />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function SystemNavigation({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  const items: { id: Tab; label: string; icon: FeatherName }[] = [
    { id: "home", label: "Apps", icon: "grid" },
    { id: "explore", label: "Explore", icon: "compass" },
    { id: "settings", label: "Profile", icon: "user" },
  ];
  return (
    <View style={local.systemNavigation}>
      <View style={local.brandLockup}>
        <BrandMark size={34} />
        <Text style={local.brand}>YOB-OS</Text>
      </View>
      <View style={local.navItems}>
        {items.map(item => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active === item.id }}
            key={item.id}
            onPress={() => onChange(item.id)}
            style={({ pressed }) => [
              local.navItem,
              active === item.id && local.navItemActive,
              pressed && local.pressed,
            ]}
          >
            <Feather
              name={item.icon}
              size={16}
              color={active === item.id ? colors.cyan : colors.subdued}
            />
            <Text
              style={[local.navText, active === item.id && local.navTextActive]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Launcher({
  home,
  token,
  arranging,
  busy,
  authMode,
  authName,
  authEmail,
  authPassword,
  onAuthMode,
  onName,
  onEmail,
  onPassword,
  onSignIn,
  onLaunch,
  onMove,
  onArrange,
  onUpdate,
  onUninstall,
}: {
  home: HomeSnapshot | null;
  token: string | null;
  arranging: boolean;
  busy: boolean;
  authMode: "login" | "register";
  authName: string;
  authEmail: string;
  authPassword: string;
  onAuthMode: (mode: "login" | "register") => void;
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSignIn: () => void;
  onLaunch: (appId: string) => void;
  onMove: (appId: string, direction: -1 | 1) => void;
  onArrange: () => void;
  onUpdate: (appId: string) => void;
  onUninstall: (appId: string) => void;
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
          <View style={local.authCard}>
            <BrandMark size={62} />
            <Text style={local.authHeadline}>Your apps, your space.</Text>
            <Text style={[styles.body, { textAlign: "center", marginTop: 9 }]}>
              Sign in to keep your home, wallpapers, and apps available wherever
              you use YOB-OS.
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
              placeholder="Password"
              secureTextEntry
            />
            <Action
              label={
                busy
                  ? "Opening…"
                  : authMode === "login"
                    ? "Sign in"
                    : "Create account"
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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const photoUri = home?.wallpaperPhotoUrl
    ? resolveUrl(home.wallpaperPhotoUrl)
    : undefined;
  const wallpaper =
    wallpapers.find(item => item.id === home?.wallpaper) ?? wallpapers[0];
  const grid = (
    <FlatList
      key={arranging ? "arrange" : "launcher"}
      data={home?.apps ?? []}
      numColumns={4}
      keyExtractor={item => item.id}
      contentContainerStyle={local.launcherGrid}
      columnWrapperStyle={local.launcherRow}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        arranging ? (
          <View style={local.arrangeBar}>
            <Text style={local.arrangeText}>Arrange your apps</Text>
            <Pressable onPress={onArrange} style={local.doneButton}>
              <Text style={local.doneText}>Done</Text>
            </Pressable>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={local.launcherEmpty}>
          <Feather name="plus" size={24} color={colors.cyan} />
          <Text style={local.launcherEmptyText}>Add apps from Explore</Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <LauncherTile
          item={item}
          index={index}
          count={home?.apps.length ?? 0}
          arranging={arranging}
          busy={busy}
          onLaunch={onLaunch}
          onMove={onMove}
          onLongPress={onArrange}
          onUpdate={onUpdate}
          onUninstall={onUninstall}
        />
      )}
    />
  );
  return (
    <View style={[local.launcher, { backgroundColor: wallpaper.accent }]}>
      {photoUri ? (
        <ImageBackground
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}
      {photoUri ? <View style={local.photoScrim} /> : null}
      {grid}
    </View>
  );
}

function LauncherTile({
  item,
  index,
  count,
  arranging,
  busy,
  onLaunch,
  onMove,
  onLongPress,
  onUpdate,
  onUninstall,
}: {
  item: HomeApp;
  index: number;
  count: number;
  arranging: boolean;
  busy: boolean;
  onLaunch: (appId: string) => void;
  onMove: (appId: string, direction: -1 | 1) => void;
  onLongPress: () => void;
  onUpdate: (appId: string) => void;
  onUninstall: (appId: string) => void;
}) {
  return (
    <View style={local.launcherTileWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          arranging ? `Arrange ${item.name}` : `Open ${item.name}`
        }
        onPress={() => (arranging ? undefined : onLaunch(item.id))}
        onLongPress={onLongPress}
        delayLongPress={350}
        style={({ pressed }) => [local.launcherTile, pressed && local.pressed]}
      >
        <View style={local.launcherIcon}>
          <Text style={local.launcherIconText}>{item.icon}</Text>
          {item.canUpdate ? <View style={local.updateDot} /> : null}
        </View>
        <Text numberOfLines={1} style={local.launcherLabel}>
          {item.name}
        </Text>
      </Pressable>
      {arranging ? (
        <View style={local.arrangeControls}>
          <Pressable
            disabled={busy || index === 0}
            onPress={() => onMove(item.id, -1)}
            style={local.arrangeControl}
          >
            <Feather name="chevron-left" size={14} color={colors.text} />
          </Pressable>
          <Pressable
            disabled={busy || index === count - 1}
            onPress={() => onMove(item.id, 1)}
            style={local.arrangeControl}
          >
            <Feather name="chevron-right" size={14} color={colors.text} />
          </Pressable>
        </View>
      ) : item.canUpdate ? (
        <Pressable onPress={() => onUpdate(item.id)} style={local.updatePill}>
          <Text style={local.updatePillText}>Update</Text>
        </Pressable>
      ) : null}
      {arranging ? (
        <Pressable
          onPress={() => onUninstall(item.id)}
          style={local.removeMini}
        >
          <Feather name="minus" size={12} color={colors.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Explore({
  home,
  apps,
  busy,
  onInstall,
  onWallpaper,
  onChoosePhoto,
}: {
  home: HomeSnapshot | null;
  apps: StoreApp[];
  busy: boolean;
  onInstall: (id: string) => void;
  onWallpaper: (wallpaper: WallpaperId) => void;
  onChoosePhoto: () => void;
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
      contentContainerStyle={local.exploreList}
      ListHeaderComponent={
        <>
          <Text style={styles.eyebrow}>EXPLORE</Text>
          <Text style={local.pageTitle}>Make your space yours.</Text>
          <View style={local.appearanceCard}>
            <View style={local.appearanceHeading}>
              <View>
                <Text style={local.cardTitle}>Appearance</Text>
                <Text style={local.cardSubtle}>
                  Choose a color or a personal photo.
                </Text>
              </View>
              <Feather name="image" size={19} color={colors.cyan} />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={local.wallpaperChoices}
            >
              {wallpapers.map(item => {
                const active =
                  !home?.wallpaperPhotoUrl && home?.wallpaper === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => onWallpaper(item.id)}
                    style={({ pressed }) => [
                      local.wallpaperChoice,
                      {
                        backgroundColor: item.accent,
                        borderColor: active ? item.color : colors.border,
                      },
                      pressed && local.pressed,
                    ]}
                  >
                    <View
                      style={[
                        local.wallpaperDot,
                        { backgroundColor: item.color },
                      ]}
                    />
                    <Text style={local.wallpaperChoiceText}>{item.label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={onChoosePhoto}
                style={({ pressed }) => [
                  local.photoChoice,
                  home?.wallpaperPhotoUrl && local.photoChoiceActive,
                  pressed && local.pressed,
                ]}
              >
                <Feather name="plus" size={17} color={colors.text} />
                <Text style={local.wallpaperChoiceText}>Photo</Text>
              </Pressable>
            </ScrollView>
          </View>
          <Text style={[styles.eyebrow, { marginTop: 25 }]}>APP LIBRARY</Text>
          <View style={local.searchWrap}>
            <Feather name="search" size={18} color={colors.subdued} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search apps"
              placeholderTextColor={colors.subdued}
              style={local.searchInput}
            />
            {search ? (
              <Pressable onPress={() => setSearch("")}>
                <Feather name="x" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </>
      }
      renderItem={({ item }) => (
        <ExploreCard app={item} busy={busy} onInstall={onInstall} />
      )}
      ListEmptyComponent={
        <Text style={[styles.body, { textAlign: "center", marginTop: 34 }]}>
          No apps match that search.
        </Text>
      }
    />
  );
}

function ExploreCard({
  app,
  busy,
  onInstall,
}: {
  app: StoreApp;
  busy: boolean;
  onInstall: (appId: string) => void;
}) {
  return (
    <View style={local.exploreCard}>
      <AppTile value={app.icon} large />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={local.appName}>
          {app.name}
        </Text>
        <Text numberOfLines={2} style={local.appDescription}>
          {app.description}
        </Text>
        <Action
          label={busy ? "Working…" : "Add to apps"}
          icon="plus"
          onPress={() => onInstall(app.id)}
          disabled={busy}
          small
        />
      </View>
    </View>
  );
}

function Settings({
  token,
  published,
  busy,
  onSetStatus,
  onLogout,
}: {
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
      contentContainerStyle={local.settingsList}
      ListHeaderComponent={
        <>
          <Text style={styles.eyebrow}>PROFILE</Text>
          <Text style={local.pageTitle}>Your account.</Text>
          <View style={local.profileCard}>
            <View style={local.profileGlyph}>
              <Feather name="user" size={22} color={colors.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={local.cardTitle}>
                {token ? "Signed in" : "Guest"}
              </Text>
              <Text style={local.cardSubtle}>
                {token
                  ? "Your preferences follow your account."
                  : "Sign in to save your apps and appearance."}
              </Text>
            </View>
            {token ? (
              <Pressable
                onPress={() => void onLogout()}
                style={local.signOutButton}
              >
                <Text style={local.signOutText}>Sign out</Text>
              </Pressable>
            ) : null}
          </View>
          {token ? (
            <>
              <Text style={[styles.eyebrow, { marginTop: 27 }]}>
                PUBLISHED APPS
              </Text>
              <Text style={local.sectionTitle}>Your listings</Text>
            </>
          ) : null}
        </>
      }
      renderItem={({ item }) => (
        <View style={local.publisherCard}>
          <View style={{ flex: 1 }}>
            <Text style={local.appName}>{item.name}</Text>
            <Text style={local.cardSubtle}>
              v{item.currentVersion?.version ?? "—"} · {item.status}
            </Text>
          </View>
          {item.status !== "deleted" ? (
            <View style={local.publisherActions}>
              <Action
                label="Pause"
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
          ) : null}
        </View>
      )}
      ListEmptyComponent={
        token ? (
          <Text style={[styles.body, { marginTop: 15 }]}>
            Published apps will appear here.
          </Text>
        ) : null
      }
    />
  );
}

function Player({ app, onExit }: { app: LaunchPayload; onExit: () => void }) {
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
      <SafeAreaView
        style={styles.screen}
        edges={["top", "left", "right", "bottom"]}
      >
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <View style={local.playerHeader}>
          <Pressable onPress={onExit} style={local.backButton}>
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={local.appName}>
              {app.name}
            </Text>
            <Text style={local.cardSubtle}>App session</Text>
          </View>
          <Action label="Close" icon="x" onPress={onExit} small />
        </View>
        <WebView
          source={{ uri: resolveUrl(app.htmlUrl) }}
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

function LoadingState() {
  return (
    <View style={local.loadingWrap}>
      <BrandMark size={70} />
      <ActivityIndicator color={colors.cyan} style={{ marginTop: 20 }} />
      <Text style={local.loadingTitle}>Opening your space</Text>
    </View>
  );
}

function BrandMark({ size }: { size: number }) {
  return (
    <View
      style={[
        local.brandMark,
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
} & Omit<ComponentProps<typeof TextInput>, "value" | "onChangeText">) {
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
      {icon ? (
        <Feather
          name={icon}
          size={small ? 14 : 16}
          color={primary ? colors.ink : danger ? colors.danger : colors.text}
        />
      ) : null}
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

function resolveUrl(value: string) {
  return value.startsWith("http") ? value : `${configuredApi}${value}`;
}

function isPhotoMime(value: string | null | undefined): value is PhotoMime {
  return (
    value === "image/jpeg" || value === "image/png" || value === "image/webp"
  );
}

const local = StyleSheet.create({
  content: { flex: 1 },
  systemNavigation: {
    minHeight: 62,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMark: {
    overflow: "hidden",
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  brand: {
    color: colors.text,
    letterSpacing: 1.15,
    fontSize: 15,
    fontWeight: "900",
  },
  navItems: { flexDirection: "row", alignItems: "center", gap: 2 },
  navItem: {
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
  },
  navItemActive: { backgroundColor: "rgba(69, 216, 255, 0.1)" },
  navText: { color: colors.subdued, fontSize: 9, fontWeight: "800" },
  navTextActive: { color: colors.cyan },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.46 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 14,
  },
  launcher: { flex: 1 },
  photoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 10, 20, 0.42)",
  },
  launcherGrid: {
    paddingHorizontal: 14,
    paddingTop: 24,
    paddingBottom: 34,
    flexGrow: 1,
  },
  launcherRow: { justifyContent: "flex-start" },
  launcherTileWrap: {
    width: "25%",
    alignItems: "center",
    minHeight: 110,
    position: "relative",
    marginBottom: 13,
  },
  launcherTile: {
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 3,
    paddingTop: 4,
  },
  launcherIcon: {
    alignItems: "center",
    justifyContent: "center",
    width: 60,
    height: 60,
    borderRadius: 19,
    backgroundColor: "rgba(9, 26, 45, 0.86)",
    borderColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 4,
  },
  launcherIconText: { color: colors.text, fontSize: 29 },
  launcherLabel: {
    color: colors.white,
    fontSize: 11,
    maxWidth: 74,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 7,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowRadius: 4,
  },
  updateDot: {
    position: "absolute",
    width: 11,
    height: 11,
    borderRadius: 6,
    right: -3,
    top: -3,
    backgroundColor: colors.mint,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  updatePill: {
    marginTop: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: "rgba(98, 230, 188, 0.94)",
  },
  updatePillText: { color: colors.ink, fontSize: 8, fontWeight: "900" },
  arrangeBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 15,
    padding: 11,
    marginBottom: 18,
    backgroundColor: "rgba(6, 17, 31, 0.75)",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  arrangeText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  doneButton: {
    backgroundColor: colors.cyan,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
  },
  doneText: { color: colors.ink, fontSize: 11, fontWeight: "900" },
  arrangeControls: { flexDirection: "row", gap: 3, marginTop: 5 },
  arrangeControl: {
    alignItems: "center",
    justifyContent: "center",
    width: 25,
    height: 22,
    borderRadius: 7,
    backgroundColor: "rgba(6, 17, 31, 0.82)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  removeMini: {
    position: "absolute",
    top: 0,
    right: 9,
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(6, 17, 31, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255, 146, 162, 0.55)",
  },
  launcherEmpty: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    minHeight: 380,
    gap: 10,
  },
  launcherEmptyText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowRadius: 4,
  },
  authScroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
  authCard: {
    ...styles.card,
    alignItems: "center",
    padding: 23,
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderStrong,
  },
  authHeadline: {
    color: colors.text,
    fontSize: 24,
    letterSpacing: -0.4,
    fontWeight: "800",
    marginTop: 17,
  },
  authModeRow: {
    flexDirection: "row",
    width: "100%",
    gap: 4,
    padding: 4,
    marginTop: 22,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
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
  fieldWrap: { width: "100%", marginTop: 14 },
  fieldLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 7,
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
  exploreList: {
    paddingHorizontal: 18,
    paddingTop: 21,
    paddingBottom: 28,
    gap: 12,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 27,
    letterSpacing: -0.55,
    fontWeight: "800",
    marginTop: 6,
  },
  appearanceCard: {
    ...styles.card,
    padding: 16,
    marginTop: 20,
    backgroundColor: colors.bgElevated,
  },
  appearanceHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cardSubtle: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    marginTop: 3,
  },
  wallpaperChoices: { gap: 8, marginTop: 14 },
  wallpaperChoice: {
    minWidth: 82,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 13,
    borderWidth: 1,
    gap: 7,
  },
  wallpaperDot: { height: 9, width: 9, borderRadius: 5 },
  wallpaperChoiceText: { color: colors.text, fontSize: 10, fontWeight: "800" },
  photoChoice: {
    minWidth: 82,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 7,
    backgroundColor: colors.surfaceRaised,
  },
  photoChoiceActive: {
    borderColor: colors.cyan,
    backgroundColor: "rgba(69, 216, 255, 0.14)",
  },
  searchWrap: {
    marginTop: 12,
    height: 51,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 15,
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
  exploreCard: { ...styles.card, flexDirection: "row", gap: 13, padding: 14 },
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
  appName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  appDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  settingsList: {
    paddingHorizontal: 18,
    paddingTop: 21,
    paddingBottom: 28,
    gap: 12,
  },
  profileCard: {
    ...styles.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    marginTop: 20,
    backgroundColor: colors.bgElevated,
  },
  profileGlyph: {
    alignItems: "center",
    justifyContent: "center",
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "rgba(69, 216, 255, 0.12)",
  },
  signOutButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: colors.dangerSurface,
  },
  signOutText: { color: colors.danger, fontSize: 11, fontWeight: "800" },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  publisherCard: {
    ...styles.card,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  publisherActions: { flexDirection: "row", gap: 7 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  actionPrimary: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  actionDanger: {
    borderColor: "rgba(255, 146, 162, 0.28)",
    backgroundColor: colors.dangerSurface,
  },
  actionSmall: { marginTop: 9, paddingHorizontal: 10, paddingVertical: 7 },
  actionFull: { alignSelf: "stretch", marginTop: 19 },
  actionText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  actionTextSmall: { fontSize: 11 },
  playerHeader: {
    minHeight: 66,
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
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
  },
});
