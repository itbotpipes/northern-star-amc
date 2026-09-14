// Contract detail: facts, workflow roadmap, visit list, and actions
// (accept agreement, request renewal, refer a friend).
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, rupees, fmtDate, gradeColors, pillFor } from "../theme";
import { Card, Pill, Row, Btn, Loading, ErrorNote, SectionTitle } from "../components/ui";

export default function ContractScreen({ route, navigation }) {
  const { id } = route.params;
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { contract } = await api.contract(id);
      setC(contract);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const requestRenewal = async () => {
    setBusy(true);
    try {
      const res = await api.requestRenewal(id);
      Alert.alert("Renewal requested", res.message || "Our team will reach out.");
    } catch (e) {
      Alert.alert("Could not send", e.message);
    } finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  const visits = (c.visits || []).slice().sort((a, b) => a.visit_number - b.visit_number);

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Header card */}
      <Card>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ref}>{c.reference}</Text>
            <Text style={styles.site}>{c.site_name}</Text>
            {c.site_address ? <Text style={styles.addr}>{c.site_address}</Text> : null}
          </View>
          <Pill status={c.status} />
        </View>
        {c.safety_grade ? (
          <View style={[styles.gradeBanner, { backgroundColor: (gradeColors[c.safety_grade_color] || theme.navy) + "14" }]}>
            <Ionicons name="shield-checkmark" size={18} color={gradeColors[c.safety_grade_color] || theme.navy} />
            <Text style={[styles.gradeText, { color: gradeColors[c.safety_grade_color] || theme.navy }]}>
              Fire Safety Score {c.safety_score}/100 · Grade {c.safety_grade}
            </Text>
          </View>
        ) : null}
      </Card>

      {/* Agreement banner */}
      {c.status === "active" && !c.agreement_accepted ? (
        <Card style={{ borderColor: theme.warning, backgroundColor: theme.warningLight }}>
          <Text style={styles.bannerTitle}>Please accept your AMC agreement</Text>
          <Text style={styles.bannerBody}>Review and accept the maintenance agreement to complete your onboarding.</Text>
          <Btn title="Review agreement" variant="navy" style={{ marginTop: 12 }}
               onPress={() => navigation.navigate("Agreement", { id: c.id })} />
        </Card>
      ) : null}

      {/* Certificate Card */}
      <Card style={{ borderColor: c.certificate_issued ? theme.amber : theme.hair, backgroundColor: c.certificate_issued ? "#fffcf5" : "#fff" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.certificate_issued ? "#fff4df" : "#f0f2fa", justifyContent: "center", alignItems: "center" }}>
            <Ionicons name="ribbon" size={24} color={c.certificate_issued ? theme.amber : theme.navy} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: theme.navy }}>
              {c.certificate_issued ? "Fire Safety Certificate Issued" : "AMC Fire Safety Certificate"}
            </Text>
            <Text style={{ fontSize: 12, color: theme.inkMuted, marginTop: 2 }}>
              {c.certificate_issued ? "Official NBC, BIS & NFPA compliance certificate ready." : `Unlocks after 4th completed visit (${c.completed_visits || 0}/${c.total_visits || 4} done).`}
            </Text>
          </View>
        </View>
        <Btn
          title={c.certificate_issued ? "View & Download Certificate" : "Check Certificate Status"}
          variant={c.certificate_issued ? "primary" : "outline"}
          style={{ marginTop: 12 }}
          onPress={() => navigation.navigate("Certificate", { id: c.id, contract: c })}
        />
      </Card>

      {/* Facts */}
      <Card>
        <SectionTitle>Contract details</SectionTitle>
        <Row label="Plan" value={c.plan} />
        <Row label="Area" value={c.area} />
        <Row label="Start date" value={fmtDate(c.start_date)} />
        <Row label="End date" value={fmtDate(c.end_date)} />
        <Row label="Annual value" value={rupees(c.price)} />
        <Row label="Payment" value={(c.payment_status || "").toUpperCase()}
             valueColor={c.payment_status === "paid" ? theme.success : theme.warning} />
        {typeof c.days_to_expiry === "number" ? (
          <Row label="Days to expiry" value={`${c.days_to_expiry} days`}
               valueColor={c.days_to_expiry <= 30 ? theme.danger : theme.ink} />
        ) : null}
      </Card>

      {/* Roadmap */}
      {c.workflow_steps && c.workflow_steps.length ? (
        <Card>
          <SectionTitle>Progress</SectionTitle>
          {c.workflow_steps.map((s, i) => (
            <View key={i} style={styles.step}>
              <View style={[styles.stepDot, s.done && { backgroundColor: theme.success, borderColor: theme.success }]}>
                {s.done ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
              </View>
              <Text style={[styles.stepLabel, s.done && { color: theme.ink, fontWeight: "700" }]}>{s.label}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Visits */}
      <SectionTitle style={{ marginTop: 4 }}>Service visits</SectionTitle>
      {visits.map((v) => {
        const c2 = pillFor(v.status);
        return (
          <TouchableOpacity key={v.id} activeOpacity={0.85}
            onPress={() => navigation.navigate("Visit", { id: v.id })}>
            <Card style={{ marginBottom: 10 }}>
              <View style={styles.visitRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.visitLabel}>{v.label}</Text>
                  <Text style={styles.visitDate}>
                    {v.status === "completed"
                      ? `Completed ${fmtDate(v.completed_date)}`
                      : `Scheduled ${fmtDate(v.scheduled_date)}`}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Pill status={v.status} tone={c2} />
                  {v.status !== "completed" && typeof v.days_until === "number" ? (
                    <DaysPill days={v.days_until} />
                  ) : null}
                </View>
              </View>
              {v.status === "completed" && !v.rated ? (
                <Text style={styles.rateHint}>Tap to rate this visit →</Text>
              ) : null}
            </Card>
          </TouchableOpacity>
        );
      })}

      {/* Actions */}
      <SectionTitle style={{ marginTop: 10 }}>Actions</SectionTitle>
      <Btn title="Refer a friend" variant="outline" style={{ marginBottom: 10 }}
           onPress={() => navigation.navigate("Refer", { id: c.id })} />
      <Btn title="Request renewal" variant="ghost" loading={busy} onPress={requestRenewal} style={{ marginBottom: 10 }} />
      <Btn title="Raise a complaint" variant="danger"
           onPress={() => navigation.navigate("RaiseTicket", { contract_id: c.id })} />
    </ScrollView>
  );
}

function DaysPill({ days }) {
  let bg = theme.blueLight, fg = theme.blue, txt = `${days} days left`;
  if (days <= 0) { bg = theme.dangerLight; fg = theme.danger; txt = days === 0 ? "Today" : "Overdue"; }
  else if (days <= 7) { bg = theme.warningLight; fg = theme.warning; }
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: "700" }}>{txt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  head: { flexDirection: "row", alignItems: "flex-start" },
  ref: { fontSize: 13, fontWeight: "700", color: theme.navy },
  site: { fontSize: 19, fontWeight: "800", color: theme.ink, marginTop: 2 },
  addr: { fontSize: 13, color: theme.inkSubtle, marginTop: 2 },
  gradeBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14,
    padding: 10, borderRadius: 10,
  },
  gradeText: { fontSize: 13, fontWeight: "700" },
  bannerTitle: { fontSize: 15, fontWeight: "700", color: theme.warning },
  bannerBody: { fontSize: 14, color: theme.inkMuted, marginTop: 4, lineHeight: 20 },
  certText: { fontSize: 14, fontWeight: "600", color: theme.ink, flex: 1 },
  step: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  stepDot: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.hair,
    alignItems: "center", justifyContent: "center", backgroundColor: "#fff",
  },
  stepLabel: { fontSize: 14, color: theme.inkSubtle },
  visitRow: { flexDirection: "row", alignItems: "center" },
  visitLabel: { fontSize: 16, fontWeight: "700", color: theme.ink },
  visitDate: { fontSize: 13, color: theme.inkSubtle, marginTop: 2 },
  rateHint: { marginTop: 10, color: theme.amberDark, fontWeight: "700", fontSize: 13 },
});
