import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

const SESSION_KEY = "yob-os-session";
const NATIVE_REDIRECT = "yobos://oauth";

export async function getSessionToken() {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function clearSessionToken() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function signIn(apiBaseUrl: string) {
  const origin = apiBaseUrl.replace(/\/$/, "");
  const startUrl = `${origin}/api/native-auth/start?redirect=${encodeURIComponent(NATIVE_REDIRECT)}`;
  const result = await WebBrowser.openAuthSessionAsync(
    startUrl,
    NATIVE_REDIRECT
  );
  if (result.type !== "success" || !result.url) {
    return null;
  }
  const token = new URL(result.url).searchParams.get("session");
  if (!token) throw new Error("YOB-OS sign-in did not return a session token.");
  await SecureStore.setItemAsync(SESSION_KEY, token);
  return token;
}
