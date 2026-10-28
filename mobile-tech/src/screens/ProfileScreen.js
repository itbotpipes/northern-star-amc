import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme";
import { Loading, ErrorNote } from "../components/ui";

function initials(name) {
  return (name || "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

const DIMENSIONS = [
  { key: "behaviour", label: "Behaviour" },
  { key: "quality", label: "Quality" },
  { key: "punctuality", label: "Punctuality" },
  { key: "communication", label: "Communication" },
];

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.me();
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: signOut },
    ]);
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  const stats = data?.stats || {};
  const breakdown = data?.rating_breakdown || {};

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(user?.name)}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.role}>
          {user?.role === "admin" ? "Admin" : user?.role === "manager" ? "Manager" : "Technician"}
          {" · "}{user?.city || "Surat HQ"}
        </Text>
        {stats.rating != null ? (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={13} color={theme.amber} />
            <Text style={styles.ratingText}>{stats.rating} · Rank —</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <Stat value={stats.visits ?? 0} label="Visits" />
          <Stat value={stats.on_time_pct != null ? `${stats.on_time_pct}%` : "—"} label="On-time" color={theme.success} />
          <Stat value={stats.rating ?? "—"} label="Rating" color={theme.amberDark} />
        </View>

        <Text style={styles.sectionTitle}>Rating breakdown</Text>
        <View style={styles.breakdownCard}>
          {DIMENSIONS.map((d) => {
            const v = breakdown[d.key];
            const pct = v ? Math.min(100, (v / 5) * 100) : 0;
            return (
              <View key={d.key} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{d.label}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%` }]} />
                </View>
                <Text style={styles.breakdownValue}>{v != null ? v.toFixed(1) : "—"}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.actionsCard}>
          <TouchableOpacity style={styles.actionRow}>
            <Ionicons name="settings-outline" size={18} color={theme.ink} />
            <Text style={styles.actionText}>Settings</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.inkSubtle} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionRow, styles.logoutRow]} onPress={confirmLogout}>
            <Ionicons name="log-out-outline" size={18} color={theme.danger} />
            <Text style={[styles.actionText, { color: theme.danger }]}>Log out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

function Stat({ value, label, color }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.navy },
  header: { alignItems: "center", paddingTop: 28, paddingBottom: 24 },
  avatar: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: theme.amber,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  avatarText: { color: "#1b1c22", fontSize: 24, fontWeight: "800" },
  name: { color: "#fff", fontSize: 19, fontWeight: "800" },
  role: { color: "#aab2d8", fontSize: 13, marginTop: 2 },
  ratingBadge: {
    flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginTop: 12,
  },
  ratingText: { color: "#fff", fontSize: 12.5, fontWeight: "700" },
  body: {
    backgroundColor: theme.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 16, minHeight: 400,
  },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 20, marginTop: 4 },
  stat: {
    flex: 1, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: theme.hair,
    padding: 14, alignItems: "center",
  },
  statValue: { fontSize: 20, fontWeight: "800", color: theme.navy },
  statLabel: { fontSize: 11.5, color: theme.inkSubtle, marginTop: 3 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: theme.ink, marginBottom: 10 },
  breakdownCard: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: theme.hair,
    padding: 16, marginBottom: 20,
  },
  breakdownRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  breakdownLabel: { width: 100, fontSize: 13, color: theme.inkMuted, fontWeight: "600" },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.hair, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: theme.navy },
  breakdownValue: { width: 30, textAlign: "right", fontSize: 13, fontWeight: "700", color: theme.ink },
  actionsCard: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: theme.hair, overflow: "hidden",
  },
  actionRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 16,
  },
  logoutRow: { borderTopWidth: 1, borderTopColor: theme.hair },
  actionText: { flex: 1, fontSize: 14.5, fontWeight: "600", color: theme.ink },
});
