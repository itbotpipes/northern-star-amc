import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, fmtDate } from "../theme";
import { Loading, ErrorNote, Empty, Pill } from "../components/ui";

export default function RefillPickupsScreen() {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.refillPickups();
      setRows(res.pickups);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.h1}>Refill pickups</Text>
        <Text style={styles.sub}>Assigned to you</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 4, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {!rows || rows.length === 0 ? (
          <Empty icon={<Ionicons name="flame-outline" size={40} color={theme.inkSubtle} />}
                 title="No pickups assigned" subtitle="Refill pickups assigned to you will show up here." />
        ) : (
          rows.map((o) => (
            <View key={o.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.ref}>{o.reference}</Text>
                <Pill status={o.status} />
              </View>
              <Text style={styles.name}>{o.name}</Text>
              <Text style={styles.summary}>
                {o.total_units} unit{o.total_units === 1 ? "" : "s"} · {(o.items || []).length} type{(o.items || []).length === 1 ? "" : "s"}
                {" · pickup "}{o.scheduled_date ? fmtDate(o.scheduled_date) : "Today"}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  header: { paddingHorizontal: 20, paddingTop: 16 },
  h1: { fontSize: 24, fontWeight: "800", color: theme.ink },
  sub: { color: theme.inkSubtle, marginTop: 2 },
  card: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: theme.hair,
    padding: 16, marginBottom: 12,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  ref: { fontSize: 13, fontWeight: "700", color: theme.navy },
  name: { fontSize: 17, fontWeight: "700", color: theme.ink },
  summary: { fontSize: 13, color: theme.inkSubtle, marginTop: 4 },
});
