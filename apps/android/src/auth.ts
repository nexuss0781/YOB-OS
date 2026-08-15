import * as SecureStore from "expo-secure-store";
import { createApi } from "./api";

const SESSION_KEY = "yob-os-session";

export async function getSessionToken() {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function clearSessionToken() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function signInWithPassword(
  apiBaseUrl: string,
  email: string,
  password: string
) {
  const api = createApi(apiBaseUrl, async () => null);
  const result = await api.auth.mobileLogin.mutate({ email, password });
  await SecureStore.setItemAsync(SESSION_KEY, result.sessionToken);
  return result.sessionToken;
}

export async function registerWithPassword(
  apiBaseUrl: string,
  name: string,
  email: string,
  password: string
) {
  const api = createApi(apiBaseUrl, async () => null);
  const result = await api.auth.mobileRegister.mutate({
    name,
    email,
    password,
  });
  await SecureStore.setItemAsync(SESSION_KEY, result.sessionToken);
  return result.sessionToken;
}
