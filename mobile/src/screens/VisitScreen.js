// Visit detail + the mandatory 5-dimension rating for completed visits.
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, fmtDate, rupees } from "../theme";
import { Card, Pill, Row, Btn, Field, Loading, ErrorNote, SectionTitle } from "../components/ui";

const DIMENSIONS = [
  { key: "behaviour", label: "Technician behaviour" },
  { key: "quality", label: "Quality of work" },
  { key: "punctuality", label: "Punctuality" },
  { key: "communication", label: "Communication" },
  { key: "overall", label: "Overall satisfaction" },
];

export default function VisitScreen({ route, navigation }) {
  const { id } = route.params;
  const [v, setV] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ratings, setRatings] = useState({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { visit } = await api.visit(id);
      setV(visit);
      if (visit.feedback) {
        setRatings({
          behaviour: visit.feedback.behaviour, quality: visit.feedback.quality,
          punctuality: visit.feedback.punctuality, communication: visit.feedback.communication,
          overall: visit.feedback.overall,
        });
        setComment(visit.feedback.comment || "");
      }
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!ratings.overall) {
      Alert.alert("Rating required", "Please give an overall star rating.");
      return;
    }
    setBusy(true);
    try {
      await api.rateVisit(id, { ...ratings, comment });
      Alert.alert("Thank you!", "Your feedback has been recorded.");
      load();
    } catch (e) {
      Alert.alert("Could not submit", e.message);
    } finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  const done = v.status === "completed";
  const alreadyRated = v.feedback && v.feedback.submitted;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ref}>{v.contract_reference}</Text>
            <Text style={styles.title}>{v.label}</Text>
          </View>
          <Pill status={v.status} />
        </View>
      </Card>

      <Card>
        <SectionTitle>Visit details</SectionTitle>
        <Row label="Scheduled" value={fmtDate(v.scheduled_date)} />
        {done ? <Row label="Completed" value={fmtDate(v.completed_date)} /> : null}
        <Row label="Technician" value={v.technician} />
        {v.onsite_duration ? <Row label="On-site time" value={v.onsite_duration} /> : null}
        {v.work_done ? <Row label="Work done" value={v.work_done} /> : null}
      </Card>

      {/* Checklist */}
      {v.checklist && v.checklist.length ? (
        <Card>
          <SectionTitle>Maintenance checklist</SectionTitle>
          {v.checklist.map((ci, i) => (
            <View key={i} style={styles.checkRow}>
              <Ionicons
                name={ci.status === "ok" ? "checkmark-circle" : ci.status === "issue" ? "alert-circle" : "remove-circle"}
                size={18}
                color={ci.status === "ok" ? theme.success : ci.status === "issue" ? theme.danger : theme.inkSubtle}
              />
              <Text style={styles.checkItem}>{ci.item}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Material quotes on this visit */}
      {v.material_quotes && v.material_quotes.length ? (
        <Card>
          <SectionTitle>Material quotations</SectionTitle>
          {v.material_quotes.map((q) => (
            <TouchableOpacity key={q.id} style={styles.mq}
              onPress={() => navigation.navigate("MaterialQuote", { id: q.id })}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mqRef}>{q.reference}</Text>
                <Text style={styles.mqTotal}>{rupees(q.grand_total)}</Text>
              </View>
              <Pill status={q.status} />
              <Ionicons name="chevron-forward" size={18} color={theme.inkSubtle} />
            </TouchableOpacity>
          ))}
        </Card>
      ) : null}

      {/* Rating */}
      {done ? (
        <Card>
          <SectionTitle>{alreadyRated ? "Your rating" : "Rate this visit"}</SectionTitle>
          {DIMENSIONS.map((d) => (
            <View key={d.key} style={styles.dimRow}>
              <Text style={styles.dimLabel}>{d.label}</Text>
              <Stars
                value={ratings[d.key] || 0}
                disabled={alreadyRated}
                onChange={(n) => setRatings((r) => ({ ...r, [d.key]: n }))}
              />
            </View>
          ))}
          {!alreadyRated ? (
            <>
              <Field label="Comment (optional)" value={comment} onChangeText={setComment}
                     placeholder="Anything you'd like to add?" multiline />
              <Btn title="Submit rating" variant="primary" loading={busy} onPress={submit} />
            </>
          ) : comment ? (
            <Text style={styles.savedComment}>"{comment}"</Text>
          ) : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}

function Stars({ value, onChange, disabled }) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} disabled={disabled} onPress={() => onChange(n)} hitSlop={6}>
          <Ionicons name={n <= value ? "star" : "star-outline"} size={26}
                    color={n <= value ? theme.amber : theme.inkSubtle} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  ref: { fontSize: 13, fontWeight: "700", color: theme.navy },
  title: { fontSize: 20, fontWeight: "800", color: theme.ink, marginTop: 2 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  checkItem: { fontSize: 14, color: theme.ink, flex: 1 },
  mq: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.hair,
  },
  mqRef: { fontSize: 13, fontWeight: "700", color: theme.navy },
  mqTotal: { fontSize: 15, fontWeight: "700", color: theme.ink, marginTop: 2 },
  dimRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.hair,
  },
  dimLabel: { fontSize: 14, color: theme.ink, flex: 1 },
  savedComment: { fontStyle: "italic", color: theme.inkMuted, marginTop: 8 },
});
