// Equipment Detail Screen — Full transparency into past refills, service visits, and dates
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  StyleSheet, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, fmtDate } from "../theme";
import { Card, Pill, Loading, ErrorNote, SectionTitle, Row, Btn } from "../components/ui";

export default function EquipmentDetailScreen({ route, navigation }) {
  const equipId = route.params?.id;
  const initialName = route.params?.name || "Equipment Details";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!equipId) return;
    try {
      setError(null);
      const res = await api.equipmentDetail(equipId);
      setData(res.equipment);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [equipId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading text={`Loading ${initialName}…`} />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;
  if (!data) return <ErrorNote message="Equipment not found." />;

  const isOverdue = data.refill_status === "overdue";
  const isDueSoon = data.refill_status === "due_soon";
  const refills = data.refill_records || [];
  const visits = data.past_visits || [];

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={{ padding: 16, paddingBottom: 50 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Overview Card */}
      <Card style={{ marginBottom: 14 }}>
        <View style={styles.headerRow}>
          <View style={styles.iconBox}>
            <Ionicons name="flame" size={24} color={theme.navy} />
          </View>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.name}>{data.name}</Text>
            <Text style={styles.typeTag}>{data.equip_type || "Fire Protection Equipment"}</Text>
          </View>
          <Pill
            status={data.refill_status}
            label={isOverdue ? "Overdue" : isDueSoon ? "Due Soon" : "OK"}
            tone={
              isOverdue
                ? { bg: "#FEE2E2", fg: "#B91C1C" }
                : isDueSoon
                ? { bg: theme.amberLight, fg: theme.amberDark }
                : { bg: "#DCFCE7", fg: "#15803D" }
            }
          />
        </View>

        <View style={styles.divider} />

        <Row label="Serial Number" value={data.serial_no || "—"} />
        <Row label="Location / Zone" value={data.location || "On-site"} />
        <Row label="Registered Site" value={data.site_name || data.contract_reference || "—"} />
        <Row label="Contract Reference" value={data.contract_reference || "—"} />

        <View style={styles.divider} />

        <Row label="Last Refilled / Serviced" value={fmtDate(data.last_refill_date)} />
        <Row
          label="Next Refill Due"
          value={fmtDate(data.next_refill_date)}
          valueColor={isOverdue ? theme.danger : isDueSoon ? theme.amberDark : theme.ink}
        />
        {data.days_to_refill !== null && data.days_to_refill !== undefined ? (
          <Row
            label="Expiry Status"
            value={
              isOverdue
                ? `Expired ${Math.abs(data.days_to_refill)} days ago`
                : `${data.days_to_refill} days remaining`
            }
            valueColor={isOverdue ? theme.danger : isDueSoon ? theme.amberDark : theme.success}
          />
        ) : null}
      </Card>

      {/* Refill Quick Action */}
      <Btn
        title="Order Refill For This Equipment"
        variant={isOverdue ? "danger" : "navy"}
        onPress={() => navigation.navigate("RequestRefill", { preselect_equipment: data.name })}
        style={{ marginBottom: 18 }}
      />

      {/* Full Refill History */}
      <SectionTitle>Refill History ({refills.length})</SectionTitle>
      {refills.length === 0 ? (
        <Card style={{ marginBottom: 18 }}>
          <Text style={styles.emptySub}>No prior refill records logged for this device.</Text>
        </Card>
      ) : (
        <Card style={{ marginBottom: 18, paddingVertical: 8 }}>
          {refills.map((r, i) => (
            <View key={r.id || i} style={[styles.timelineItem, i < refills.length - 1 && styles.timelineBorder]}>
              <View style={styles.timelineDot}>
                <Ionicons name="checkmark-circle" size={16} color={theme.success} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.refillDate}>Serviced: {fmtDate(r.refill_date)}</Text>
                  {r.vendor ? <Text style={styles.vendorTag}>{r.vendor}</Text> : null}
                </View>
                {r.next_due_date ? (
                  <Text style={styles.dueText}>Next due was: {fmtDate(r.next_due_date)}</Text>
                ) : null}
                {r.notes ? <Text style={styles.refillNotes}>"{r.notes}"</Text> : null}
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Past Service Visits */}
      <SectionTitle>Past Service Visits ({visits.length})</SectionTitle>
      {visits.length === 0 ? (
        <Card>
          <Text style={styles.emptySub}>No completed service visits on record for this contract yet.</Text>
        </Card>
      ) : (
        <Card style={{ paddingVertical: 8 }}>
          {visits.map((v, i) => (
            <TouchableOpacity
              key={v.id || i}
              activeOpacity={0.8}
              onPress={() => navigation.navigate("Visit", { id: v.id })}
              style={[styles.visitRow, i < visits.length - 1 && styles.timelineBorder]}
            >
              <View style={styles.visitIcon}>
                <Ionicons name="shield-checkmark-outline" size={18} color={theme.navy} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.visitLabel}>{v.label || `Visit #${v.visit_number}`}</Text>
                <Text style={styles.visitTech}>Technician: {v.technician_name}</Text>
                <Text style={styles.visitDate}>Completed {fmtDate(v.completed_date || v.scheduled_date)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.inkSubtle} />
            </TouchableOpacity>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.navy + "12",
    justifyContent: "center",
    alignItems: "center",
  },
  name: { fontSize: 16, fontWeight: "800", color: theme.ink },
  typeTag: { fontSize: 12, color: theme.inkSubtle, marginTop: 2 },
  divider: { height: 1, backgroundColor: theme.hair, marginVertical: 12 },
  emptySub: { fontSize: 13, color: theme.inkMuted, textAlign: "center", paddingVertical: 10 },
  timelineItem: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  timelineBorder: { borderBottomWidth: 1, borderBottomColor: theme.hair },
  timelineDot: { marginTop: 2 },
  refillDate: { fontSize: 13, fontWeight: "700", color: theme.ink },
  vendorTag: { fontSize: 11, color: theme.inkSubtle, fontWeight: "500" },
  dueText: { fontSize: 12, color: theme.inkMuted, marginTop: 2 },
  refillNotes: { fontSize: 12, color: theme.inkSubtle, fontStyle: "italic", marginTop: 4 },
  visitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  visitIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: theme.navy + "0c",
    justifyContent: "center",
    alignItems: "center",
  },
  visitLabel: { fontSize: 14, fontWeight: "700", color: theme.ink },
  visitTech: { fontSize: 12, color: theme.inkMuted, marginTop: 1 },
  visitDate: { fontSize: 11, color: theme.inkSubtle, marginTop: 1 },
});
