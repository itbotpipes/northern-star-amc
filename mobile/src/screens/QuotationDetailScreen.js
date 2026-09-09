// Service quotation detail: line items, totals, and accept / negotiate actions.
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { theme, rupees, fmtDate } from "../theme";
import { Card, Pill, Row, Btn, Field, Loading, ErrorNote, SectionTitle } from "../components/ui";

export default function QuotationDetailScreen({ route }) {
  const { id } = route.params;
  const [q, setQ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showNegotiate, setShowNegotiate] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setError(null);
      const { quotation } = await api.serviceQuotation(id);
      setQ(quotation);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const accept = () => {
    Alert.alert("Accept quotation", "Confirm you accept this quotation and its price?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Accept", onPress: async () => {
          setBusy(true);
          try { await api.acceptQuote(id); Alert.alert("Accepted", "Thank you! Our team will proceed."); load(); }
          catch (e) { Alert.alert("Failed", e.message); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  const negotiate = async () => {
    if (!note.trim()) { Alert.alert("Add a message", "Tell our team what you'd like to change."); return; }
    setBusy(true);
    try {
      await api.negotiateQuote(id, note.trim());
      Alert.alert("Sent", "Our team will review and get back to you.");
      setShowNegotiate(false); setNote(""); load();
    } catch (e) { Alert.alert("Failed", e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  const canRespond = !["accepted", "rejected"].includes(q.status);

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ref}>{q.reference}</Text>
            <Text style={styles.name}>{q.project_name || q.service_type?.toUpperCase()}</Text>
          </View>
          <Pill status={q.status} label={q.status_label} />
        </View>
        <Text style={styles.valid}>Valid for {q.valid_days} days · {fmtDate(q.created_at)}</Text>
      </Card>

      {/* Items */}
      <Card>
        <SectionTitle>Line items</SectionTitle>
        {(q.items || []).map((it) => (
          <View key={it.id} style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemDesc}>{it.description}</Text>
              <Text style={styles.itemMeta}>{it.quantity} {it.unit} × {rupees(it.rate)}</Text>
            </View>
            <Text style={styles.itemTotal}>{rupees(it.total)}</Text>
          </View>
        ))}
        <View style={{ marginTop: 8 }}>
          <Row label="Subtotal" value={rupees(q.subtotal)} />
          <Row label={`GST (${q.gst_percent}%)`} value={rupees(q.gst_amount)} />
          <View style={styles.grand}>
            <Text style={styles.grandLabel}>Grand total</Text>
            <Text style={styles.grandValue}>{rupees(q.grand_total)}</Text>
          </View>
        </View>
      </Card>

      {q.negotiation_note ? (
        <Card style={{ backgroundColor: theme.warningLight, borderColor: theme.warning }}>
          <Text style={styles.noteLabel}>Your revision request</Text>
          <Text style={styles.noteBody}>{q.negotiation_note}</Text>
        </Card>
      ) : null}

      {q.is_paid ? (
        <Card style={{ backgroundColor: theme.successLight, borderColor: theme.success }}>
          <Text style={{ color: theme.success, fontWeight: "700", textAlign: "center" }}>Payment received — thank you!</Text>
        </Card>
      ) : null}

      {/* Actions */}
      {canRespond ? (
        <>
          <Btn title="Accept quotation" variant="success" loading={busy} onPress={accept} style={{ marginBottom: 10 }} />
          {!showNegotiate ? (
            <Btn title="Request a change" variant="outline" onPress={() => setShowNegotiate(true)} />
          ) : (
            <Card>
              <SectionTitle>Request a change</SectionTitle>
              <Field value={note} onChangeText={setNote} placeholder="Describe what you'd like adjusted…" multiline />
              <Btn title="Send to team" variant="navy" loading={busy} onPress={negotiate} />
              <TouchableOpacity onPress={() => setShowNegotiate(false)} style={{ marginTop: 12 }}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <Text style={{ textAlign: "center", color: theme.inkMuted }}>
            This quotation has been {q.status}.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  head: { flexDirection: "row", alignItems: "flex-start" },
  ref: { fontSize: 13, fontWeight: "700", color: theme.navy },
  name: { fontSize: 18, fontWeight: "800", color: theme.ink, marginTop: 2 },
  valid: { fontSize: 13, color: theme.inkSubtle, marginTop: 8 },
  item: {
    flexDirection: "row", gap: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.hair,
  },
  itemDesc: { fontSize: 14, color: theme.ink, fontWeight: "600" },
  itemMeta: { fontSize: 12, color: theme.inkSubtle, marginTop: 2 },
  itemTotal: { fontSize: 14, fontWeight: "700", color: theme.ink },
  grand: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 12, paddingTop: 12, borderTopWidth: 2, borderTopColor: theme.navy,
  },
  grandLabel: { fontSize: 16, fontWeight: "800", color: theme.ink },
  grandValue: { fontSize: 20, fontWeight: "800", color: theme.navy },
  noteLabel: { fontSize: 13, fontWeight: "700", color: theme.warning },
  noteBody: { fontSize: 14, color: theme.inkMuted, marginTop: 4 },
  cancel: { textAlign: "center", color: theme.inkSubtle, fontWeight: "600" },
});
