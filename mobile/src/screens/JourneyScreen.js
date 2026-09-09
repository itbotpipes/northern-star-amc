// Customer journey timeline — a vertical list of key events.
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, gradeColors, fmtDate } from "../theme";
import { Loading, ErrorNote, Empty } from "../components/ui";

// Map the API's icon keys to Ionicons.
const ICONS = {
  doc: "document-text", send: "paper-plane", eye: "eye", chat: "chatbubble-ellipses",
  check: "checkmark-circle", x: "close-circle", shield: "shield-checkmark",
  sign: "create", calendar: "calendar", coin: "cash", star: "star",
  users: "people", dot: "ellipse",
};

export default function JourneyScreen() {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setError(null); const { events } = await api.journey(); setRows(events); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      {!rows || rows.length === 0 ? (
        <Empty icon={<Ionicons name="time-outline" size={40} color={theme.inkSubtle} />}
               title="Your journey starts here"
               subtitle="Key milestones with us will show up on this timeline." />
      ) : (
        rows.map((e, i) => {
          const color = gradeColors[e.color] || theme.navy;
          const last = i === rows.length - 1;
          return (
            <View key={e.id} style={styles.row}>
              <View style={styles.railCol}>
                <View style={[styles.icon, { backgroundColor: color + "18" }]}>
                  <Ionicons name={ICONS[e.icon] || "ellipse"} size={16} color={color} />
                </View>
                {!last ? <View style={styles.rail} /> : null}
              </View>
              <View style={styles.content}>
                <Text style={styles.desc}>{e.description}</Text>
                <Text style={styles.date}>{fmtDate(e.created_at)}</Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  row: { flexDirection: "row", gap: 12 },
  railCol: { alignItems: "center", width: 34 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  rail: { width: 2, flex: 1, backgroundColor: theme.hair, marginVertical: 2 },
  content: { flex: 1, paddingBottom: 22, paddingTop: 4 },
  desc: { fontSize: 15, color: theme.ink, fontWeight: "600", lineHeight: 21 },
  date: { fontSize: 13, color: theme.inkSubtle, marginTop: 3 },
});
