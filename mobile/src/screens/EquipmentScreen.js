// Equipment Inventory & Transparency Screen
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  TextInput, StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, fmtDate } from "../theme";
import { Card, Pill, Loading, ErrorNote, SectionTitle, Btn } from "../components/ui";

export default function EquipmentScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.equipment();
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading text="Loading fire equipment inventory…" />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  const allItems = data?.equipment || [];
  const total = data?.total || 0;
  const overdueCount = data?.overdue_count || 0;
  const dueSoonCount = data?.due_soon_count || 0;
  const okCount = data?.ok_count || 0;

  const filtered = allItems.filter((item) => {
    const matchesSearch =
      (item.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.serial_no || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.location || "").toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (filterStatus === "overdue") return item.refill_status === "overdue";
    if (filterStatus === "due_soon") return item.refill_status === "due_soon";
    if (filterStatus === "ok") return item.refill_status === "ok";
    return true;
  });

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={{ padding: 16, paddingBottom: 50 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Metric Cards Header */}
      <View style={styles.metricGrid}>
        <TouchableOpacity
          style={[styles.metricCard, filterStatus === "all" && styles.metricCardActive]}
          onPress={() => setFilterStatus("all")}
          activeOpacity={0.8}
        >
          <Text style={styles.metricValue}>{total}</Text>
          <Text style={styles.metricLabel}>Total Devices</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.metricCard, styles.metricOverdue, filterStatus === "overdue" && styles.metricCardActiveOverdue]}
          onPress={() => setFilterStatus(filterStatus === "overdue" ? "all" : "overdue")}
          activeOpacity={0.8}
        >
          <Text style={[styles.metricValue, { color: theme.danger }]}>{overdueCount}</Text>
          <Text style={[styles.metricLabel, { color: theme.danger }]}>Overdue</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.metricCard, styles.metricDueSoon, filterStatus === "due_soon" && styles.metricCardActiveDueSoon]}
          onPress={() => setFilterStatus(filterStatus === "due_soon" ? "all" : "due_soon")}
          activeOpacity={0.8}
        >
          <Text style={[styles.metricValue, { color: theme.amberDark }]}>{dueSoonCount}</Text>
          <Text style={[styles.metricLabel, { color: theme.amberDark }]}>Due Soon</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.metricCard, styles.metricOk, filterStatus === "ok" && styles.metricCardActiveOk]}
          onPress={() => setFilterStatus(filterStatus === "ok" ? "all" : "ok")}
          activeOpacity={0.8}
        >
          <Text style={[styles.metricValue, { color: theme.success }]}>{okCount}</Text>
          <Text style={[styles.metricLabel, { color: theme.success }]}>Good (OK)</Text>
        </TouchableOpacity>
      </View>

      {/* Critical Overdue Warning Banner */}
      {overdueCount > 0 && (
        <View style={styles.alertBanner}>
          <Ionicons name="alert-circle" size={20} color={theme.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>{overdueCount} Extinguisher{overdueCount > 1 ? "s" : ""} Overdue for Refill</Text>
            <Text style={styles.alertSub}>Immediate refilling recommended to maintain mandatory fire NOC & safety compliance.</Text>
          </View>
          <TouchableOpacity
            style={styles.alertActionBtn}
            onPress={() => navigation.navigate("RequestRefill")}
          >
            <Text style={styles.alertActionTxt}>Refill</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search Input */}
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color={theme.inkSubtle} />
        <TextInput
          placeholder="Search by equipment, location or serial no…"
          placeholderTextColor={theme.inkSubtle}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={16} color={theme.inkSubtle} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Section Title */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <SectionTitle>
          {filterStatus !== "all" ? `${filterStatus.replace("_", " ").toUpperCase()} Equipment` : "All Equipment"} ({filtered.length})
        </SectionTitle>
        <TouchableOpacity onPress={() => navigation.navigate("RequestRefill")}>
          <Text style={styles.refillLink}>+ Order Refill</Text>
        </TouchableOpacity>
      </View>

      {/* Equipment List */}
      {filtered.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>
            {search || filterStatus !== "all" ? "No equipment matches your filter." : "No registered fire equipment found for your contracts."}
          </Text>
        </Card>
      ) : (
        filtered.map((e) => {
          const isOverdue = e.refill_status === "overdue";
          const isDueSoon = e.refill_status === "due_soon";
          return (
            <TouchableOpacity
              key={e.id}
              activeOpacity={0.85}
              onPress={() => navigation.navigate("EquipmentDetail", { id: e.id, name: e.name })}
            >
              <Card style={{ marginBottom: 10 }}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.equipName}>{e.name}</Text>
                    <Text style={styles.location}>
                      <Ionicons name="location-outline" size={12} color={theme.inkSubtle} /> {e.location || "On-site"}
                      {e.site_name ? ` · ${e.site_name}` : ""}
                    </Text>
                  </View>
                  <Pill
                    status={e.refill_status}
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

                <View style={styles.metaRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.metaLabel}>Serial No</Text>
                    <Text style={styles.metaValue}>{e.serial_no || "—"}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.metaLabel}>Last Serviced</Text>
                    <Text style={styles.metaValue}>{fmtDate(e.last_refill_date)}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.metaLabel}>Next Refill Due</Text>
                    <Text
                      style={[
                        styles.metaValue,
                        isOverdue && { color: theme.danger, fontWeight: "700" },
                        isDueSoon && { color: theme.amberDark, fontWeight: "700" },
                      ]}
                    >
                      {fmtDate(e.next_refill_date)}
                    </Text>
                  </View>
                </View>

                <View style={styles.tapRow}>
                  <Text style={styles.tapHint}>
                    {e.days_to_refill !== null && e.days_to_refill !== undefined
                      ? isOverdue
                        ? `Expired ${Math.abs(e.days_to_refill)} days ago`
                        : `${e.days_to_refill} days left`
                      : "View history"}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={styles.viewMore}>Full Transparency</Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.navy} />
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  metricGrid: { flexDirection: "row", gap: 8, marginBottom: 14 },
  metricCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.hair,
  },
  metricCardActive: { borderColor: theme.navy, backgroundColor: theme.navy + "0c" },
  metricOverdue: { backgroundColor: "#FFF5F5" },
  metricCardActiveOverdue: { borderColor: theme.danger, borderWidth: 1.5 },
  metricDueSoon: { backgroundColor: "#FFFBEB" },
  metricCardActiveDueSoon: { borderColor: theme.amber, borderWidth: 1.5 },
  metricOk: { backgroundColor: "#F0FDF4" },
  metricCardActiveOk: { borderColor: theme.success, borderWidth: 1.5 },
  metricValue: { fontSize: 18, fontWeight: "800", color: theme.ink },
  metricLabel: { fontSize: 10, color: theme.inkSubtle, marginTop: 2, fontWeight: "600" },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    padding: 12,
    marginBottom: 14,
  },
  alertTitle: { fontSize: 13, fontWeight: "700", color: "#991B1B" },
  alertSub: { fontSize: 11, color: "#B91C1C", marginTop: 2, lineHeight: 15 },
  alertActionBtn: {
    backgroundColor: theme.danger,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  alertActionTxt: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.hair,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 13, color: theme.ink, padding: 0 },
  refillLink: { fontSize: 12, fontWeight: "700", color: theme.navy },
  emptyText: { color: theme.inkMuted, fontSize: 13, textAlign: "center", paddingVertical: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  equipName: { fontSize: 15, fontWeight: "700", color: theme.ink },
  location: { fontSize: 12, color: theme.inkSubtle, marginTop: 3 },
  divider: { height: 1, backgroundColor: theme.hair, marginVertical: 10 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaLabel: { fontSize: 10, color: theme.inkSubtle, textTransform: "uppercase", fontWeight: "600" },
  metaValue: { fontSize: 12, color: theme.ink, marginTop: 2, fontWeight: "600" },
  tapRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.hair,
  },
  tapHint: { fontSize: 11, color: theme.inkSubtle, fontWeight: "500" },
  viewMore: { fontSize: 11, color: theme.navy, fontWeight: "700", marginRight: 2 },
});

