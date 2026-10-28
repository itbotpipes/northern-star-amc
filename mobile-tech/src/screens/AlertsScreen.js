import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, fmtDateTime } from "../theme";
import { Loading, ErrorNote, Empty } from "../components/ui";

// Best-effort icon by keyword — the Notification model itself has no "kind"
// field, just a title/body, same as the customer app's notification list.
function iconFor(title = "") {
  const t = title.toLowerCase();
  if (t.includes("emergency")) return { name: "location", bg: theme.dangerLight, fg: theme.danger };
  if (t.includes("reassign")) return { name: "swap-horizontal", bg: theme.blueLight, fg: theme.blue };
  if (t.includes("rated") || t.includes("rating") || t.includes("star")) return { name: "star", bg: theme.amberLight, fg: theme.amberDark };
  return { name: "notifications", bg: theme.blueLight, fg: theme.blue };
}

export default function AlertsScreen() {
  const [rows, setRows] = useState(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.notifications();
      setRows(res.notifications);
      setUnread(res.unread);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markAll = async () => {
    try { await api.markNotificationsRead(); load(); } catch {}
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.h1}>Alerts</Text>
        {unread > 0 ? (
          <TouchableOpacity onPress={markAll}>
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 4, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {!rows || rows.length === 0 ? (
          <Empty icon={<Ionicons name="notifications-outline" size={40} color={theme.inkSubtle} />}
                 title="No alerts" subtitle="Updates about your visits will appear here." />
        ) : (
          rows.map((n) => {
            const ic = iconFor(n.title);
            return (
              <View key={n.id} style={[styles.card, !n.read && styles.cardUnread]}>
                <View style={[styles.icon, { backgroundColor: ic.bg }]}>
                  <Ionicons name={ic.name} size={16} color={ic.fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{n.title}</Text>
                  {n.body ? <Text style={styles.body}>{n.body}</Text> : null}
                  <Text style={styles.date}>{fmtDateTime(n.created_at)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 16,
  },
  h1: { fontSize: 24, fontWeight: "800", color: theme.ink },
  markAll: { color: theme.navy, fontWeight: "700", fontSize: 13 },
  card: {
    flexDirection: "row", gap: 12, backgroundColor: "#fff", borderWidth: 1,
    borderColor: theme.hair, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  cardUnread: { borderColor: theme.amber },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "700", color: theme.ink },
  body: { fontSize: 13.5, color: theme.inkMuted, marginTop: 3, lineHeight: 19 },
  date: { fontSize: 12, color: theme.inkSubtle, marginTop: 6 },
});
