import { StyleSheet } from "react-native";

export const colors = {
  bg: "#06111F",
  bgElevated: "#091A2D",
  surface: "#0E2035",
  surfaceRaised: "#132A44",
  surfaceMuted: "#102238",
  border: "rgba(182, 210, 239, 0.14)",
  borderStrong: "rgba(115, 216, 255, 0.34)",
  text: "#F4F8FF",
  muted: "#A9BBD0",
  subdued: "#7388A2",
  primary: "#6B82FF",
  primaryStrong: "#5069F4",
  cyan: "#45D8FF",
  mint: "#62E6BC",
  danger: "#FF92A2",
  dangerSurface: "rgba(255, 126, 146, 0.11)",
  ink: "#06111F",
  white: "#FFFFFF",
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 20 },
  eyebrow: {
    color: colors.cyan,
    fontSize: 10,
    letterSpacing: 1.55,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    fontWeight: "800",
  },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
  },
});
