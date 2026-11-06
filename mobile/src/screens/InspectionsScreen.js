// Site Inspections & Audits — mirrors WebApp portal/inspections.html
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Linking,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme } from "../theme";
import { Card, Loading, ErrorNote, SectionTitle } from "../components/ui";

export default function InspectionsScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.inspections();
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loading text="Loading site inspections…" />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  const scheduled = data?.scheduled_inspections || [];
  const completed = data?.completed_inspections || [];

  const handleCall = (phone) => {
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={{ padding: 16, paddingBottom: 50 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Site Inspections & Audits</Text>
          <Text style={styles.sub}>
            Track on-site fire safety surveys, assigned certified engineers, and safety audit reports.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.newBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate("NewAMC")}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text style={styles.newBtnText}>+ Request Inspection</Text>
        </TouchableOpacity>
      </View>

      {/* Scheduled / Upcoming Section */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Scheduled Site Inspections</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{scheduled.length}</Text>
        </View>
      </View>

      {scheduled.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={32} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No scheduled inspections</Text>
          <Text style={styles.emptySub}>
            Need an on-site survey, fire safety audit, or initial site inspection?
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.navigate("NewAMC")}
          >
            <Text style={styles.emptyBtnText}>Request Site Visit →</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        scheduled.map((insp, idx) => (
          <Card key={insp.reference || idx} style={styles.inspCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.refCode}>{insp.reference}</Text>
              <View style={styles.badgeScheduled}>
                <Text style={styles.badgeTextScheduled}>{insp.badge || "Inspection Scheduled"}</Text>
              </View>
            </View>

            <Text style={styles.serviceName}>{insp.service_name}</Text>
            <Text style={styles.siteName}>{insp.site_name}</Text>

            <View style={styles.detailsBox}>
              <View style={styles.detailRow}>
                <Ionicons name="calendar" size={15} color={theme.colors.navy} />
                <Text style={styles.detailText}>
                  Visit Date: <Text style={styles.bold}>{insp.scheduled_date || "To be confirmed"}</Text>
                  {insp.time_slot ? ` · ${insp.time_slot}` : ""}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Ionicons name="person" size={15} color="#475569" />
                <Text style={styles.detailText}>
                  Certified Engineer: <Text style={styles.bold}>{insp.technician_name}</Text>
                </Text>
              </View>

              {insp.technician_phone ? (
                <TouchableOpacity
                  style={styles.callRow}
                  activeOpacity={0.8}
                  onPress={() => handleCall(insp.technician_phone)}
                >
                  <Ionicons name="call" size={14} color="#059669" />
                  <Text style={styles.callText}>Call Engineer ({insp.technician_phone})</Text>
                </TouchableOpacity>
              ) : null}

              {insp.address ? (
                <View style={styles.detailRow}>
                  <Ionicons name="location-outline" size={15} color="#64748B" />
                  <Text style={styles.detailText} numberOfLines={1}>{insp.address}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.statusLive}>Live Status: On Schedule</Text>
            </View>
          </Card>
        ))
      )}

      {/* Completed Section */}
      {completed.length > 0 && (
        <>
          <View style={[styles.sectionHead, { marginTop: 24 }]}>
            <Text style={styles.sectionTitle}>Completed Inspections</Text>
            <View style={[styles.countBadge, { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" }]}>
              <Text style={[styles.countText, { color: "#166534" }]}>{completed.length}</Text>
            </View>
          </View>

          {completed.map((insp, idx) => (
            <Card key={`done-${insp.reference || idx}`} style={styles.inspCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.refCode}>{insp.reference}</Text>
                <View style={[styles.badgeScheduled, { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" }]}>
                  <Text style={[styles.badgeTextScheduled, { color: "#166534" }]}>Completed</Text>
                </View>
              </View>

              <Text style={styles.serviceName}>{insp.service_name}</Text>
              <Text style={styles.siteName}>{insp.site_name}</Text>

              <View style={styles.detailsBox}>
                <View style={styles.detailRow}>
                  <Ionicons name="checkmark-circle" size={15} color="#059669" />
                  <Text style={styles.detailText}>
                    Conducted on: <Text style={styles.bold}>{insp.completed_date || insp.scheduled_date || "Done"}</Text>
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="person" size={15} color="#475569" />
                  <Text style={styles.detailText}>Engineer: {insp.technician_name}</Text>
                </View>
              </View>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A", letterSpacing: -0.3 },
  sub: { fontSize: 13, color: "#64748B", marginTop: 4, lineHeight: 18, marginBottom: 12 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.navy,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  newBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#1E293B" },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: "#E0F2FE",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  countText: { fontSize: 11, fontWeight: "800", color: "#0369A1" },
  inspCard: {
    marginBottom: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  refCode: { fontSize: 13, fontWeight: "800", color: theme.colors.navy, fontFamily: "monospace" },
  badgeScheduled: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#E0F2FE",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  badgeTextScheduled: { fontSize: 11, fontWeight: "700", color: "#0284C7" },
  serviceName: { fontSize: 15, fontWeight: "800", color: "#0F172A", marginBottom: 2 },
  siteName: { fontSize: 13, color: "#475569", fontWeight: "500", marginBottom: 10 },
  detailsBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { fontSize: 12, color: "#334155", flex: 1 },
  bold: { fontWeight: "700", color: "#0F172A" },
  callRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2 },
  callText: { fontSize: 12, fontWeight: "700", color: "#059669" },
  cardFooter: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  statusLive: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  emptyCard: {
    alignItems: "center",
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#334155", marginTop: 8 },
  emptySub: { fontSize: 12, color: "#64748B", textAlign: "center", marginTop: 4, lineHeight: 17 },
  emptyBtn: {
    marginTop: 12,
    backgroundColor: theme.colors.navy,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  emptyBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
});
