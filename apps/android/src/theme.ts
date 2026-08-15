import { StyleSheet } from "react-native";

export const colors = {
  bg: "#090914",
  surface: "#121223",
  surfaceSoft: "#17172a",
  border: "rgba(255,255,255,0.11)",
  text: "#f5f4ff",
  muted: "#a5a3bd",
  violet: "#c4b5fd",
  cyan: "#b6f3f3",
  darkText: "#111126",
  danger: "#fda4af",
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 20 },
  eyebrow: {
    color: colors.violet,
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: "800",
  },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 22,
  },
});
