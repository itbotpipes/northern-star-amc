// Shared UI building blocks — mirrors the customer app's components/ui.js so
// both native surfaces (and the web app) share one consistent look.
import React from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator, TextInput, StyleSheet,
} from "react-native";
import { theme, pillFor } from "../theme";

// ---- Card -----------------------------------------------------------------
export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ---- Section heading (uppercase eyebrow) ----------------------------------
export function SectionTitle({ children, style }) {
  return <Text style={[styles.section, style]}>{children}</Text>;
}

// ---- Status pill ----------------------------------------------------------
export function Pill({ status, label, tone }) {
  const c = tone || pillFor(status);
  const text = label || (status || "").replace(/_/g, " ");
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

// ---- Button ---------------------------------------------------------------
export function Btn({ title, onPress, variant = "primary", loading, disabled, style }) {
  const v = BTN[variant] || BTN.primary;
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[
        styles.btn,
        { backgroundColor: v.bg, borderColor: v.border || v.bg },
        v.outline && { borderWidth: 1.5 },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[styles.btnText, { color: v.fg }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export function Button({ title, label, onPress, variant = "primary", tone, loading, disabled, style }) {
  const effectiveTitle = title || label;
  const effectiveVariant = tone === "navy" ? "primary" : (tone || variant);
  return (
    <Btn
      title={effectiveTitle}
      onPress={onPress}
      variant={effectiveVariant}
      loading={loading}
      disabled={disabled}
      style={style}
    />
  );
}

const BTN = {
  primary: { bg: theme.navy, fg: "#ffffff" },
  amber: { bg: theme.amber, fg: "#1b1c22" },
  danger: { bg: theme.danger, fg: "#ffffff" },
  success: { bg: theme.success, fg: "#ffffff" },
  outline: { bg: "transparent", fg: theme.navy, border: theme.navy, outline: true },
  ghost: { bg: theme.canvas, fg: theme.inkMuted, border: theme.hair, outline: true },
};

// ---- Labeled key/value row ------------------------------------------------
export function Row({ label, value, valueColor }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor && { color: valueColor }]} numberOfLines={2}>
        {value ?? "—"}
      </Text>
    </View>
  );
}

// ---- Text input field -----------------------------------------------------
export function Field({ label, value, onChangeText, placeholder, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        style={[styles.input, props.multiline && { height: 96, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.inkSubtle}
        {...props}
      />
    </View>
  );
}

// ---- Loading + empty + error states ---------------------------------------
export function Loading({ text }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.navy} />
      {text ? <Text style={styles.muted}>{text}</Text> : null}
    </View>
  );
}

export function Empty({ title, subtitle, icon }) {
  return (
    <View style={styles.center}>
      {icon}
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
    </View>
  );
}

export function ErrorNote({ message, onRetry }) {
  return (
    <View style={styles.center}>
      <Text style={[styles.emptyTitle, { color: theme.danger }]}>Something went wrong</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry ? <Btn title="Try again" variant="outline" onPress={onRetry} style={{ marginTop: 14 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.hair,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#101828",
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  section: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.inkSubtle,
    marginBottom: 10,
    marginTop: 4,
  },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  btn: {
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18,
    alignItems: "center", justifyContent: "center",
  },
  btnText: { fontSize: 15, fontWeight: "700" },
  row: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.hair, gap: 12,
  },
  rowLabel: { color: theme.inkSubtle, fontSize: 14, flexShrink: 0 },
  rowValue: { color: theme.ink, fontSize: 14, fontWeight: "600", flex: 1, textAlign: "right" },
  fieldLabel: { color: theme.inkMuted, fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: theme.hair, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: theme.ink, backgroundColor: "#fff",
  },
  center: { alignItems: "center", justifyContent: "center", padding: 40, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: theme.ink, marginTop: 8 },
  muted: { color: theme.inkSubtle, fontSize: 14, textAlign: "center" },
});

export { styles as uiStyles };
