// Home / dashboard: greeting, quick counts, contract cards, quick actions.
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { theme, rupees, fmtDate, gradeColors } from "../theme";
import { Card, Pill, Loading, ErrorNote, SectionTitle } from "../components/ui";

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.dashboard();
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loading text="Loading your dashboard…" />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  const counts = data.counts || {};
  const contracts = data.contracts || [];
  const firstName = (user?.name || "there").split(" ")[0];

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.hi}>Hello, {firstName}</Text>
      <Text style={styles.sub}>Your fire-safety, all in one place.</Text>

      {/* Quick counts */}
      <View style={styles.stats}>
        <Stat icon="document-text" label="Contracts" value={counts.contracts ?? 0}
              onPress={() => {}} />
        <Stat icon="pricetag" label="Open quotes" value={counts.pending_quotes ?? 0}
              onPress={() => navigation.navigate("Quotes")} />
        <Stat icon="notifications" label="Alerts" value={counts.unread_notifications ?? 0}
              onPress={() => navigation.navigate("Alerts")} />
      </View>

      {/* Quick actions */}
      <SectionTitle>Quick actions</SectionTitle>
      <View style={styles.actions}>
        <Action icon="pricetags-outline" label="Quotations" onPress={() => navigation.navigate("Quotes")} />
        <Action icon="chatbox-ellipses-outline" label="Raise complaint" onPress={() => navigation.navigate("RaiseTicket", {})} />
        <Action icon="time-outline" label="My journey" onPress={() => navigation.navigate("Journey")} />
        <Action icon="construct-outline" label="Requests" onPress={() => navigation.navigate("Requests")} />
      </View>

      {/* Contracts */}
      <SectionTitle style={{ marginTop: 8 }}>My AMC contracts</SectionTitle>
      {contracts.length === 0 ? (
        <Card>
          <Text style={styles.muted}>No contracts yet. Once you sign up for an AMC plan, it will appear here.</Text>
        </Card>
      ) : (
        contracts.map((c) => (
          <TouchableOpacity key={c.id} activeOpacity={0.85}
            onPress={() => navigation.navigate("Contract", { id: c.id })}>
            <Card>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ref}>{c.reference}</Text>
                  <Text style={styles.site}>{c.site_name}</Text>
                </View>
                <Pill status={c.status} />
              </View>

              <View style={styles.metaRow}>
                <Meta label="Plan" value={c.plan || "—"} />
                <Meta label="Visits" value={`${c.completed_visits}/${c.total_visits}`} />
                <Meta label="Value" value={rupees(c.price)} />
              </View>

              <View style={styles.footer}>
                {c.safety_grade ? (
                  <View style={[styles.grade, { backgroundColor: (gradeColors[c.safety_grade_color] || theme.navy) + "18" }]}>
                    <Text style={[styles.gradeText, { color: gradeColors[c.safety_grade_color] || theme.navy }]}>
                      Safety {c.safety_grade}
                    </Text>
                  </View>
                ) : <View />}
                {c.next_visit ? (
                  <Text style={styles.next}>Next visit {fmtDate(c.next_visit.scheduled_date)}</Text>
                ) : (
                  <Text style={styles.next}>Tap to view</Text>
                )}
              </View>
            </Card>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

function Stat({ icon, label, value, onPress }) {
  return (
    <TouchableOpacity style={styles.stat} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={20} color={theme.navy} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function Action({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={22} color={theme.navy} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function Meta({ label, value }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  hi: { fontSize: 24, fontWeight: "800", color: theme.ink },
  sub: { color: theme.inkMuted, marginTop: 2, marginBottom: 18 },
  stats: { flexDirection: "row", gap: 10, marginBottom: 20 },
  stat: {
    flex: 1, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.hair,
    borderRadius: 14, padding: 14, alignItems: "center", gap: 2,
  },
  statValue: { fontSize: 22, fontWeight: "800", color: theme.ink, marginTop: 4 },
  statLabel: { fontSize: 12, color: theme.inkSubtle },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
  action: {
    width: "47%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.hair,
    borderRadius: 12, padding: 12,
  },
  actionIcon: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: theme.amberLight,
    alignItems: "center", justifyContent: "center",
  },
  actionLabel: { fontSize: 14, fontWeight: "600", color: theme.ink, flexShrink: 1 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  ref: { fontSize: 13, fontWeight: "700", color: theme.navy, fontVariant: ["tabular-nums"] },
  site: { fontSize: 17, fontWeight: "700", color: theme.ink, marginTop: 2 },
  metaRow: { flexDirection: "row", gap: 8 },
  metaLabel: { fontSize: 11, color: theme.inkSubtle, textTransform: "uppercase", letterSpacing: 0.4 },
  metaValue: { fontSize: 14, fontWeight: "700", color: theme.ink, marginTop: 2 },
  footer: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.hair,
  },
  grade: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  gradeText: { fontSize: 12, fontWeight: "700" },
  next: { fontSize: 13, color: theme.inkMuted, fontWeight: "600" },
  muted: { color: theme.inkSubtle, fontSize: 14, lineHeight: 20 },
});
