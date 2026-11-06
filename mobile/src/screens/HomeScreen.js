// Home / dashboard: greeting, quick counts, unsigned agreement banner, portal pills, contract cards, quick actions.
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Linking, Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { theme, rupees, fmtDate } from "../theme";
import { Card, Pill, Loading, ErrorNote, SectionTitle } from "../components/ui";

const gradeColors = {
  emerald: theme.success,
  amber: theme.warning,
  rose: theme.danger,
};

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

  const handleCallEmergency = () => {
    Linking.openURL("tel:18008918565").catch(() => {
      Alert.alert("Emergency Dispatch", "Call our 24x7 control room at 1800-891-8565");
    });
  };

  if (loading) return <Loading text="Loading your dashboard…" />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  const counts = data?.counts || {};
  const contracts = data?.contracts || [];
  const firstName = (user?.name || "there").split(" ")[0];

  // Contracts where agreement has been generated but not yet accepted
  const unsignedAgreements = contracts.filter(
    (c) => (c.status === "active" || c.status === "pending") && !c.agreement_accepted
  );

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={{ padding: 16, paddingBottom: 50 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.hi}>Hello, {firstName}</Text>
      <Text style={styles.sub}>Your fire-safety, all in one place.</Text>

      {/* Top Portal Navigation Pills — exact mirror of WebApp base_portal.html */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.portalPillsWrap}
        style={styles.portalPillsScroll}
      >
        <TouchableOpacity
          style={[styles.portalPill, styles.portalPillActive]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate("Inspections")}
        >
          <Ionicons name="clipboard-outline" size={14} color={theme.colors.navy} />
          <Text style={styles.portalPillText}>Site Inspections</Text>
          {(counts.scheduled_inspections ?? 0) > 0 && (
            <View style={styles.pillBadge}>
              <Text style={styles.pillBadgeText}>{counts.scheduled_inspections}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.portalPill}
          activeOpacity={0.8}
          onPress={() => navigation.navigate("Journey")}
        >
          <Ionicons name="time-outline" size={14} color={theme.colors.navy} />
          <Text style={styles.portalPillText}>My Journey</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.portalPill}
          activeOpacity={0.8}
          onPress={() => navigation.navigate("Equipment")}
        >
          <Ionicons name="shield-outline" size={14} color={theme.colors.navy} />
          <Text style={styles.portalPillText}>Equipment</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.portalPill}
          activeOpacity={0.8}
          onPress={() => navigation.navigate("Quotes")}
        >
          <Ionicons name="pricetags-outline" size={14} color={theme.colors.navy} />
          <Text style={styles.portalPillText}>Quotations</Text>
          {(counts.pending_quotes ?? 0) > 0 && (
            <View style={styles.pillBadge}>
              <Text style={styles.pillBadgeText}>{counts.pending_quotes}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.portalPill}
          activeOpacity={0.8}
          onPress={() => navigation.navigate("Requests")}
        >
          <Ionicons name="construct-outline" size={14} color={theme.colors.navy} />
          <Text style={styles.portalPillText}>My Requests</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.portalPill, styles.portalPillPrimary]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate("NewAMC")}
        >
          <Ionicons name="add-circle" size={14} color="#FFFFFF" />
          <Text style={[styles.portalPillText, { color: "#FFFFFF", fontWeight: "700" }]}>+ New AMC</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Unsigned AMC Agreement Ready for Signature Banner — matches WebApp dashboard.html */}
      {unsignedAgreements.length > 0 && (
        <View style={styles.agreementAlert}>
          <View style={styles.agreementAlertHead}>
            <View style={styles.alertIconBox}>
              <Ionicons name="shield-half" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>
                {unsignedAgreements.length === 1
                  ? "AMC Agreement Ready for Signature"
                  : `${unsignedAgreements.length} AMC Agreements Ready for Signature`}
              </Text>
              <Text style={styles.alertSub}>
                Your AMC agreement has been generated. Please review the terms and complete your digital sign-off to activate scheduled visits.
              </Text>
            </View>
          </View>
          {unsignedAgreements.map((c) => (
            <View key={c.id} style={styles.agreementCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.agreementRef}>{c.reference}</Text>
                <Text style={styles.agreementSite} numberOfLines={1}>
                  {c.site_name || "Covered Site"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.signBtn}
                activeOpacity={0.85}
                onPress={() => navigation.navigate("Agreement", { id: c.id })}
              >
                <Text style={styles.signBtnText}>Review & Sign →</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* 24x7 Emergency SOS Card */}
      <View style={styles.sosCard}>
        <View style={styles.sosHeader}>
          <View style={styles.sosTitleRow}>
            <View style={styles.sosBadgeIcon}>
              <Ionicons name="warning" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.sosTitle}>24x7 Emergency Response</Text>
          </View>
          <View style={styles.slaTag}>
            <Text style={styles.slaText}>⚡ 4-Hr SLA</Text>
          </View>
        </View>
        <Text style={styles.sosSub}>Immediate dispatch for active fire hazards & safety emergencies.</Text>

        <View style={styles.sosBtnRow}>
          <TouchableOpacity style={styles.sosCallBtn} activeOpacity={0.85} onPress={handleCallEmergency}>
            <Ionicons name="call" size={16} color="#FFFFFF" />
            <Text style={styles.sosCallTxt}>Call 1800-891-8565</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sosReqBtn} activeOpacity={0.85} onPress={() => navigation.navigate("Requests")}>
            <Ionicons name="flash-outline" size={16} color="#B91C1C" />
            <Text style={styles.sosReqTxt}>Urgent Visit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick counts */}
      <View style={styles.stats}>
        <Stat icon="document-text" label="Contracts" value={counts.contracts ?? 0}
              onPress={() => {}} />
        <Stat icon="clipboard" label="Inspections" value={counts.scheduled_inspections ?? 0}
              onPress={() => navigation.navigate("Inspections")} />
        <Stat icon="pricetag" label="Open quotes" value={counts.pending_quotes ?? 0}
              onPress={() => navigation.navigate("Quotes")} />
        <Stat icon="notifications" label="Alerts" value={counts.unread_notifications ?? 0}
              onPress={() => navigation.navigate("Alerts")} />
      </View>

      {/* Quick actions */}
      <SectionTitle>Quick actions</SectionTitle>
      <View style={styles.actions}>
        <Action icon="add-circle-outline" label="+ New AMC" onPress={() => navigation.navigate("NewAMC")} />
        <Action icon="clipboard-outline" label="Inspections" onPress={() => navigation.navigate("Inspections")} />
        <Action icon="shield-outline" label="Equipment" onPress={() => navigation.navigate("Equipment")} />
        <Action icon="flame-outline" label="Refill order" onPress={() => navigation.navigate("RequestRefill")} />
        <Action icon="ribbon-outline" label="Certificates" onPress={() => {
          const activeContract = contracts.find((c) => c.status === "active") || contracts[0];
          if (activeContract) {
            navigation.navigate("Certificate", { id: activeContract.id, contract: activeContract });
          } else {
            Alert.alert("No Active AMC", "A certificate is generated once your contract completes its service cycle.");
          }
        }} />
        <Action icon="pricetags-outline" label="Quotations" onPress={() => navigation.navigate("Quotes")} />
        <Action icon="chatbox-ellipses-outline" label="Complaints" onPress={() => navigation.navigate("RaiseTicket", {})} />
        <Action icon="time-outline" label="My journey" onPress={() => navigation.navigate("Journey")} />
        <Action icon="construct-outline" label="Requests" onPress={() => navigation.navigate("Requests")} />
      </View>

      {/* New AMC Application Banner */}
      <TouchableOpacity
        style={styles.newAmcBanner}
        activeOpacity={0.85}
        onPress={() => navigation.navigate("NewAMC")}
      >
        <View style={styles.newAmcIcon}>
          <Ionicons name="document-text" size={20} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.newAmcTitle}>Need a New AMC for Another Site?</Text>
          <Text style={styles.newAmcSub}>Submit site details for an on-site inspection & quotation.</Text>
        </View>
        <View style={styles.newAmcBtn}>
          <Text style={styles.newAmcBtnText}>Send Enquiry</Text>
          <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
        </View>
      </TouchableOpacity>

      {/* Contracts */}
      <SectionTitle style={{ marginTop: 8 }}>My AMC contracts</SectionTitle>
      {contracts.length === 0 ? (
        <Card>
          <Text style={styles.muted}>No contracts yet. Protect your building with an Annual Maintenance Contract.</Text>
          <TouchableOpacity
            style={styles.applyNowBtn}
            onPress={() => navigation.navigate("NewAMC")}
          >
            <Ionicons name="add-circle" size={18} color="#FFFFFF" />
            <Text style={styles.applyNowText}>Apply for New AMC</Text>
          </TouchableOpacity>
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

              {/* Inspection Notice on pending contract */}
              {c.status === "pending" && c.inspection_scheduled_date ? (
                <View style={styles.inspectionNoticeBox}>
                  <Ionicons name="calendar-outline" size={14} color="#0284C7" />
                  <Text style={styles.inspectionNoticeText}>
                    Inspection: {fmtDate(c.inspection_scheduled_date)} · Certified Engineer Assigned
                  </Text>
                </View>
              ) : null}

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
  sub: { color: theme.inkMuted, marginTop: 2, marginBottom: 12 },

  portalPillsScroll: {
    marginBottom: 16,
  },
  portalPillsWrap: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  portalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: theme.hair,
  },
  portalPillActive: {
    borderColor: "#BAE6FD",
    backgroundColor: "#F0F9FF",
  },
  portalPillPrimary: {
    backgroundColor: theme.navy,
    borderColor: theme.navy,
  },
  portalPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.ink,
  },
  pillBadge: {
    backgroundColor: theme.navy,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  pillBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },

  agreementAlert: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1.5,
    borderColor: "#F59E0B",
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  agreementAlertHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  alertIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#D97706",
    alignItems: "center",
    justifyContent: "center",
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#78350F",
  },
  alertSub: {
    fontSize: 12,
    color: "#92400E",
    marginTop: 2,
    lineHeight: 16,
  },
  agreementCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  agreementRef: {
    fontSize: 12,
    fontWeight: "800",
    fontFamily: "monospace",
    color: theme.navy,
  },
  agreementSite: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
  },
  signBtn: {
    backgroundColor: theme.navy,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  signBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

  sosCard: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1.5,
    borderColor: "#FCA5A5",
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
  },
  sosHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sosTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sosBadgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#DC2626",
    justifyContent: "center",
    alignItems: "center",
  },
  sosTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#991B1B",
  },
  slaTag: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  slaText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#B91C1C",
  },
  sosSub: {
    fontSize: 12,
    color: "#7F1D1D",
    lineHeight: 17,
    marginBottom: 12,
  },
  sosBtnRow: {
    flexDirection: "row",
    gap: 10,
  },
  sosCallBtn: {
    flex: 1.1,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sosCallTxt: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  sosReqBtn: {
    flex: 0.9,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sosReqTxt: {
    color: "#991B1B",
    fontSize: 13,
    fontWeight: "700",
  },

  stats: { flexDirection: "row", gap: 8, marginBottom: 20 },
  stat: {
    flex: 1, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.hair,
    borderRadius: 14, padding: 12, alignItems: "center", gap: 2,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: theme.ink, marginTop: 4 },
  statLabel: { fontSize: 11, color: theme.inkSubtle },

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
  actionLabel: { fontSize: 13, fontWeight: "600", color: theme.ink, flexShrink: 1 },

  cardHead: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  ref: { fontSize: 13, fontWeight: "700", color: theme.navy, fontVariant: ["tabular-nums"] },
  site: { fontSize: 16, fontWeight: "700", color: theme.ink, marginTop: 2 },
  metaRow: { flexDirection: "row", gap: 8 },
  metaLabel: { fontSize: 11, color: theme.inkSubtle, textTransform: "uppercase", letterSpacing: 0.4 },
  metaValue: { fontSize: 13, fontWeight: "700", color: theme.ink, marginTop: 2 },

  inspectionNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  inspectionNoticeText: {
    fontSize: 11,
    color: "#0369A1",
    fontWeight: "600",
    flex: 1,
  },

  footer: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.hair,
  },
  grade: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  gradeText: { fontSize: 12, fontWeight: "700" },
  next: { fontSize: 12, color: theme.inkMuted, fontWeight: "600" },
  muted: { color: theme.inkSubtle, fontSize: 14, lineHeight: 20 },

  newAmcBanner: {
    backgroundColor: theme.navy,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
    marginBottom: 10,
  },
  newAmcIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  newAmcTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  newAmcSub: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2 },
  newAmcBtn: {
    backgroundColor: theme.amber,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  newAmcBtnText: { color: "#1b1c22", fontSize: 12, fontWeight: "700" },

  applyNowBtn: {
    backgroundColor: theme.navy,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  applyNowText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
