// List of the customer's service quotations.
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, rupees, fmtDate } from "../theme";
import { Card, Pill, Loading, ErrorNote, Empty } from "../components/ui";

export default function QuotationsScreen({ navigation }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { quotations } = await api.serviceQuotations();
      setRows(quotations);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  if (!rows || rows.length === 0) {
    return (
      <ScrollView style={styles.wrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <Empty icon={<Ionicons name="pricetags-outline" size={40} color={theme.inkSubtle} />}
               title="No quotations yet"
               subtitle="Quotations shared by our team will appear here." />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      {rows.map((q) => (
        <TouchableOpacity key={q.id} activeOpacity={0.85}
          onPress={() => navigation.navigate("QuotationDetail", { id: q.id })}>
          <Card>
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ref}>{q.reference}</Text>
                <Text style={styles.name}>{q.project_name || q.service_type?.toUpperCase()}</Text>
              </View>
              <Pill status={q.status} label={q.status_label} />
            </View>
            <View style={styles.foot}>
              <Text style={styles.total}>{rupees(q.grand_total)}</Text>
              <Text style={styles.date}>{fmtDate(q.created_at)}</Text>
            </View>
            {q.is_paid ? (
              <View style={styles.paid}><Ionicons name="checkmark-circle" size={14} color={theme.success} />
                <Text style={styles.paidText}>Paid</Text></View>
            ) : null}
          </Card>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  head: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  ref: { fontSize: 13, fontWeight: "700", color: theme.navy },
  name: { fontSize: 16, fontWeight: "700", color: theme.ink, marginTop: 2 },
  foot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  total: { fontSize: 18, fontWeight: "800", color: theme.ink },
  date: { fontSize: 13, color: theme.inkSubtle },
  paid: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  paidText: { color: theme.success, fontWeight: "700", fontSize: 13 },
});
