// Notifications list with a "mark all read" action.
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, fmtDateTime } from "../theme";
import { Loading, ErrorNote, Empty } from "../components/ui";

export default function NotificationsScreen() {
  const [rows, setRows] = useState(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.notifications();
      setRows(res.notifications); setUnread(res.unread);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markAll = async () => {
    try { await api.markNotificationsRead(); load(); } catch {}
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <View style={styles.wrap}>
      {unread > 0 ? (
        <TouchableOpacity style={styles.markAll} onPress={markAll}>
          <Text style={styles.markAllText}>{unread} unread · Mark all read</Text>
        </TouchableOpacity>
      ) : null}
      <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {!rows || rows.length === 0 ? (
          <Empty icon={<Ionicons name="notifications-outline" size={40} color={theme.inkSubtle} />}
                 title="No notifications" subtitle="Updates about your service will appear here." />
        ) : (
          rows.map((n) => (
            <View key={n.id} style={[styles.item, !n.read && styles.unreadItem]}>
              <View style={[styles.dot, { backgroundColor: n.read ? theme.hair : theme.amber }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{n.title}</Text>
                {n.body ? <Text style={styles.body}>{n.body}</Text> : null}
                <Text style={styles.date}>{fmtDateTime(n.created_at)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  markAll: { padding: 12, alignItems: "center", backgroundColor: theme.amberLight },
  markAllText: { color: theme.amberDark, fontWeight: "700", fontSize: 13 },
  item: {
    flexDirection: "row", gap: 12, backgroundColor: "#fff", borderWidth: 1,
    borderColor: theme.hair, borderRadius: 12, padding: 14, marginBottom: 10,
  },
  unreadItem: { borderColor: theme.amber },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  title: { fontSize: 15, fontWeight: "700", color: theme.ink },
  body: { fontSize: 14, color: theme.inkMuted, marginTop: 3, lineHeight: 20 },
  date: { fontSize: 12, color: theme.inkSubtle, marginTop: 6 },
});
