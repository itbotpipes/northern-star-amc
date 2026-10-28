import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, fmtDate } from "../theme";
import { Loading, ErrorNote, Empty, Pill } from "../components/ui";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "done", label: "Done" },
];

const STATUS_PILL = {
  scheduled: "scheduled",
  in_progress: "in_progress",
  completed: "completed",
  cancelled: "cancelled",
};

export default function VisitsScreen({ navigation }) {
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (f) => {
    try {
      setError(null);
      const res = await api.visits(f);
      setRows(res.visits);
      setCount(res.count);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(filter); }, [filter, load]));

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.h1}>My visits</Text>
        <Text style={styles.sub}>{count} assigned</Text>
      </View>

      <View style={styles.chipsRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} onRetry={() => { setLoading(true); load(filter); }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 4, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(filter); }} />}
        >
          {!rows || rows.length === 0 ? (
            <Empty icon={<Ionicons name="checkmark-done-outline" size={40} color={theme.inkSubtle} />}
                   title="No visits here" subtitle="Try a different filter." />
          ) : (
            rows.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => navigation.navigate("VisitDetail", { id: v.id })}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.siteName} numberOfLines={1}>{v.site_name || v.contract_reference}</Text>
                  <Pill status={STATUS_PILL[v.status] || v.status} />
                </View>
                <Text style={styles.visitLabel}>{v.label} of 4</Text>
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={13} color={theme.inkSubtle} />
                    <Text style={styles.metaText}>{fmtDate(v.scheduled_date)}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={13} color={theme.inkSubtle} />
                    <Text style={styles.metaText} numberOfLines={1}>{v.area || "—"}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  header: { paddingHorizontal: 20, paddingTop: 16 },
  h1: { fontSize: 24, fontWeight: "800", color: theme.ink },
  sub: { color: theme.inkSubtle, marginTop: 2, marginBottom: 14 },
  chipsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: "#fff", borderWidth: 1, borderColor: theme.hair,
  },
  chipActive: { backgroundColor: theme.navy, borderColor: theme.navy },
  chipText: { fontSize: 13, fontWeight: "700", color: theme.inkMuted },
  chipTextActive: { color: "#fff" },
  card: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: theme.hair,
    padding: 16, marginBottom: 12,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  siteName: { fontSize: 16, fontWeight: "700", color: theme.ink, flex: 1 },
  visitLabel: { fontSize: 13, color: theme.inkSubtle, marginTop: 3, marginBottom: 10 },
  metaRow: { flexDirection: "row", gap: 16 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 12.5, color: theme.inkMuted },
});
