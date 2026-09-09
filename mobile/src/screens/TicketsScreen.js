// Support tickets / complaints list, with a "New complaint" button.
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, fmtDate } from "../theme";
import { Card, Pill, Loading, ErrorNote, Empty, Btn } from "../components/ui";

export default function TicketsScreen({ navigation }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setError(null); const { tickets } = await api.tickets(); setRows(tickets); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {!rows || rows.length === 0 ? (
          <Empty icon={<Ionicons name="chatbox-ellipses-outline" size={40} color={theme.inkSubtle} />}
                 title="No complaints"
                 subtitle="Raise a complaint and our team will respond within 24 hours." />
        ) : (
          rows.map((t) => (
            <TouchableOpacity key={t.id} activeOpacity={0.85}
              onPress={() => navigation.navigate("TicketDetail", { id: t.id })}>
              <Card>
                <View style={styles.head}>
                  <Text style={styles.ref}>{t.reference}</Text>
                  <Pill status={t.status} label={t.status_label} />
                </View>
                <Text style={styles.title}>{t.title}</Text>
                <View style={styles.foot}>
                  <Text style={styles.date}>{fmtDate(t.created_at)}</Text>
                  {t.is_overdue ? (
                    <Text style={styles.overdue}>Awaiting reply</Text>
                  ) : null}
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
      <View style={styles.fabWrap}>
        <Btn title="+ New complaint" variant="danger" onPress={() => navigation.navigate("RaiseTicket", {})} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  ref: { fontSize: 13, fontWeight: "700", color: theme.navy },
  title: { fontSize: 16, fontWeight: "700", color: theme.ink },
  foot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  date: { fontSize: 13, color: theme.inkSubtle },
  overdue: { fontSize: 13, color: theme.danger, fontWeight: "700" },
  fabWrap: {
    position: "absolute", left: 16, right: 16, bottom: 20,
  },
});
