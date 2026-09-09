// Emergency / NOC service requests + on-demand refill orders (read-only lists).
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, rupees, fmtDate } from "../theme";
import { Card, Pill, Loading, ErrorNote, SectionTitle, Empty } from "../components/ui";

export default function RequestsScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.requests());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  const requests = data.requests || [];
  const refills = data.refills || [];
  const empty = requests.length === 0 && refills.length === 0;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      {empty ? (
        <Empty icon={<Ionicons name="construct-outline" size={40} color={theme.inkSubtle} />}
               title="No requests yet"
               subtitle="Emergency, NOC, and refill requests will appear here." />
      ) : null}

      {requests.length ? <SectionTitle>Emergency & NOC</SectionTitle> : null}
      {requests.map((r) => (
        <Card key={`r${r.id}`}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ref}>{r.reference}</Text>
              <Text style={styles.title}>{r.request_type === "noc" ? "NOC assistance" : "Emergency response"}</Text>
            </View>
            <Pill status={r.status} />
          </View>
          {r.description ? <Text style={styles.desc}>{r.description}</Text> : null}
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{fmtDate(r.created_at)}</Text>
            {r.sla_label ? <Text style={[styles.meta, { color: theme.warning }]}>{r.sla_label}</Text> : null}
          </View>
        </Card>
      ))}

      {refills.length ? <SectionTitle style={{ marginTop: 8 }}>Refill orders</SectionTitle> : null}
      {refills.map((o) => (
        <Card key={`o${o.id}`}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ref}>{o.reference}</Text>
              <Text style={styles.title}>{o.summary || `${o.total_units} unit(s)`}</Text>
            </View>
            <Pill status={o.status} />
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{fmtDate(o.created_at)}</Text>
            {o.amount ? <Text style={styles.meta}>{rupees(o.amount)}</Text> : null}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  head: { flexDirection: "row", alignItems: "flex-start" },
  ref: { fontSize: 13, fontWeight: "700", color: theme.navy },
  title: { fontSize: 16, fontWeight: "700", color: theme.ink, marginTop: 2 },
  desc: { fontSize: 14, color: theme.inkMuted, marginTop: 8, lineHeight: 20 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  meta: { fontSize: 13, color: theme.inkSubtle },
});
