import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { theme, fmtDayHeader } from "../theme";
import { Loading, ErrorNote, Pill } from "../components/ui";

function initials(name) {
  return (name || "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

// A visit's route-card status: Done (completed) / Next (first upcoming one for
// the day) / Scheduled (any other upcoming one).
function routeStatus(visit, firstUpcomingId) {
  if (visit.status === "completed") return { label: "Done", tone: "ok" };
  if (visit.id === firstUpcomingId) return { label: "Next", tone: "next" };
  return { label: "Scheduled", tone: "scheduled" };
}

export default function TodayScreen({ navigation }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [todayRes, inqRes] = await Promise.all([
        api.today().catch(() => ({})),
        api.inquiries().catch(() => ({ inquiries: [] })),
      ]);
      setData(todayRes);
      setInquiries(inqRes.inquiries || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loading text="Loading your day…" />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  const counts = (data && data.counts) || {};
  const visits = (data && data.visits) || [];
  const firstUpcoming = visits.find((v) => v.status !== "completed");

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.date}>{fmtDayHeader(data.date)}</Text>
          <Text style={styles.hi}>Hi, {(user?.name || "").split(" ")[0] || "there"}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(user?.name)}</Text>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat value={counts.today ?? 0} label="Today's visits" color="#fff" />
        <Stat value={counts.completed ?? 0} label="Completed" color={theme.success} light />
        <Stat value={counts.remaining ?? 0} label="Remaining" color={theme.amber} light />
      </View>

      <View style={styles.body}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Today's route</Text>
          <Text style={styles.mapLink}>Map view</Text>
        </View>

        {visits.length === 0 ? (
          <View style={styles.emptyRoute}>
            <Ionicons name="checkmark-circle-outline" size={32} color={theme.inkSubtle} />
            <Text style={styles.emptyText}>No visits scheduled for today.</Text>
          </View>
        ) : (
          visits.map((v) => {
            const st = routeStatus(v, firstUpcoming?.id);
            return (
              <TouchableOpacity
                key={v.id}
                style={styles.routeCard}
                activeOpacity={0.85}
                onPress={() => navigation.navigate("VisitDetail", { id: v.id })}
              >
                <View style={styles.timeCol}>
                  <Text style={styles.timeMain}>
                    {v.scheduled_time_label ? v.scheduled_time_label.split(" ")[0] : "—"}
                  </Text>
                  <Text style={styles.timeSuffix}>
                    {v.scheduled_time_label ? v.scheduled_time_label.split(" ")[1] : "Time TBD"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.siteName} numberOfLines={1}>{v.site_name || v.contract_reference}</Text>
                  <Text style={styles.siteSub} numberOfLines={1}>{v.label} · {v.area || v.site_address}</Text>
                </View>
                <Pill label={st.label} status={st.tone} />
              </TouchableOpacity>
            );
          })
        )}

        {data.refill_pickups_count > 0 ? (
          <TouchableOpacity style={styles.pickupBanner} activeOpacity={0.85}
            onPress={() => navigation.navigate("RefillPickups")}>
            <View style={styles.pickupIcon}>
              <Ionicons name="notifications" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pickupTitle}>
                {data.refill_pickups_count} refill pickup{data.refill_pickups_count > 1 ? "s" : ""} assigned
              </Text>
              <Text style={styles.pickupSub} numberOfLines={1}>
                {(data.refill_pickups_preview || []).join(" · ")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.inkSubtle} />
          </TouchableOpacity>
        {/* Assigned Customer Inquiries / Site Inspections */}
        <View style={{ marginTop: 24 }}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Inquiry Site Inspections</Text>
            <Text style={styles.mapLink}>{inquiries.length} assigned</Text>
          </View>

          {inquiries.length === 0 ? (
            <View style={styles.emptyRoute}>
              <Ionicons name="clipboard-outline" size={28} color={theme.inkSubtle} />
              <Text style={styles.emptyText}>No site inspection inquiries assigned.</Text>
            </View>
          ) : (
            inquiries.map((inq) => (
              <TouchableOpacity
                key={inq.id}
                style={[styles.routeCard, { borderLeftWidth: 4, borderLeftColor: theme.amber }]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate("InquiryChecklist", { id: inq.id })}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: theme.navy }}>{inq.reference}</Text>
                    {inq.visit_scheduled_date ? (
                      <Text style={{ fontSize: 11, color: theme.inkSubtle }}>
                        · {inq.visit_scheduled_date}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.siteName} numberOfLines={1}>{inq.customer_name}</Text>
                  <Text style={styles.siteSub} numberOfLines={1}>
                    {inq.service_requirement} · {[inq.area, inq.city].filter(Boolean).join(", ")}
                  </Text>
                </View>
                <Pill
                  label={inq.status === "checklist_submitted" ? "Done" : (inq.status === "site_visit_in_progress" ? "In Progress" : "Pending Visit")}
                  status={inq.status === "checklist_submitted" ? "ok" : "warn"}
                />
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function Stat({ value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.navy },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 20,
    paddingTop: 16, paddingBottom: 8,
  },
  date: { color: "#aab2d8", fontSize: 13, fontWeight: "600" },
  hi: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 2 },
  avatar: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: theme.amber,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: "#1b1c22", fontWeight: "800" },
  stats: {
    flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24,
  },
  stat: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 14,
    padding: 14, alignItems: "flex-start",
  },
  statValue: { color: "#fff", fontSize: 26, fontWeight: "800" },
  statLabel: { color: "#c3c9e8", fontSize: 12, marginTop: 2 },
  body: {
    backgroundColor: theme.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingHorizontal: 16, minHeight: 400,
  },
  sectionRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: theme.ink },
  mapLink: { color: theme.navy, fontWeight: "700", fontSize: 13 },
  routeCard: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff",
    borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.hair,
  },
  timeCol: { width: 56 },
  timeMain: { fontSize: 15, fontWeight: "800", color: theme.navy },
  timeSuffix: { fontSize: 11, color: theme.inkSubtle, fontWeight: "600" },
  siteName: { fontSize: 15, fontWeight: "700", color: theme.ink },
  siteSub: { fontSize: 12.5, color: theme.inkSubtle, marginTop: 2 },
  emptyRoute: { alignItems: "center", padding: 30, gap: 8 },
  emptyText: { color: theme.inkSubtle, fontSize: 14 },
  pickupBanner: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.blueLight,
    borderRadius: 14, padding: 14, marginTop: 4, marginBottom: 20,
  },
  pickupIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: theme.navy,
    alignItems: "center", justifyContent: "center",
  },
  pickupTitle: { fontSize: 14, fontWeight: "700", color: theme.ink },
  pickupSub: { fontSize: 12.5, color: theme.inkSubtle, marginTop: 1 },
});
