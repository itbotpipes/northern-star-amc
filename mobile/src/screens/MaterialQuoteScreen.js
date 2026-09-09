// Visit-linked material quotation: approve, or decline (which requires accepting
// the liability waiver, exactly like the web portal).
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, Alert, Modal, TouchableOpacity,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { theme, rupees, fmtDate } from "../theme";
import { Card, Pill, Row, Btn, Loading, ErrorNote, SectionTitle } from "../components/ui";

export default function MaterialQuoteScreen({ route }) {
  const { id } = route.params;
  const [q, setQ] = useState(null);
  const [waiver, setWaiver] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showWaiver, setShowWaiver] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.materialQuote(id);
      setQ(res.quotation);
      setWaiver(res.waiver_text || "");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const approve = () => {
    Alert.alert("Approve quotation", "Approve these materials for replacement?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve", onPress: async () => {
          setBusy(true);
          try { await api.decideMaterialQuote(id, "approve", false); Alert.alert("Approved", "Thank you."); load(); }
          catch (e) { Alert.alert("Failed", e.message); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  const confirmDecline = async () => {
    setBusy(true);
    try {
      await api.decideMaterialQuote(id, "reject", true);
      setShowWaiver(false);
      Alert.alert("Declined", "Your decision has been recorded.");
      load();
    } catch (e) { Alert.alert("Failed", e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  const canDecide = q.status === "pending";

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card>
        <View style={styles.head}>
          <Text style={styles.ref}>{q.reference}</Text>
          <Pill status={q.status} />
        </View>
        <Text style={styles.sub}>Material / spare-parts quotation · {fmtDate(q.created_at)}</Text>
      </Card>

      <Card>
        <SectionTitle>Items</SectionTitle>
        {(q.items || []).map((it) => (
          <View key={it.id} style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemDesc}>{it.description}</Text>
              <Text style={styles.itemMeta}>{it.quantity} × {rupees(it.unit_price)}</Text>
            </View>
            <Text style={styles.itemTotal}>{rupees(it.amount)}</Text>
          </View>
        ))}
        <View style={{ marginTop: 8 }}>
          <Row label="Subtotal" value={rupees(q.subtotal)} />
          <Row label="GST (18%)" value={rupees(q.gst_amount)} />
          <View style={styles.grand}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{rupees(q.grand_total)}</Text>
          </View>
        </View>
      </Card>

      {q.payment_status === "paid" ? (
        <Card style={{ backgroundColor: theme.successLight, borderColor: theme.success }}>
          <Text style={{ color: theme.success, fontWeight: "700", textAlign: "center" }}>Paid</Text>
        </Card>
      ) : null}

      {canDecide ? (
        <>
          <Btn title="Approve" variant="success" loading={busy} onPress={approve} style={{ marginBottom: 10 }} />
          <Btn title="Decline" variant="outline" onPress={() => setShowWaiver(true)} />
        </>
      ) : (
        <Card><Text style={{ textAlign: "center", color: theme.inkMuted }}>
          This quotation has been {q.status}.
        </Text></Card>
      )}

      {/* Waiver modal */}
      <Modal visible={showWaiver} transparent animationType="slide" onRequestClose={() => setShowWaiver(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Liability waiver</Text>
            <ScrollView style={{ maxHeight: 240 }}>
              <Text style={styles.waiverText}>{waiver}</Text>
            </ScrollView>
            <Btn title="I accept & decline" variant="danger" loading={busy} onPress={confirmDecline} style={{ marginTop: 16 }} />
            <TouchableOpacity onPress={() => setShowWaiver(false)} style={{ marginTop: 12 }}>
              <Text style={styles.cancel}>Go back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ref: { fontSize: 16, fontWeight: "800", color: theme.navy },
  sub: { fontSize: 13, color: theme.inkSubtle, marginTop: 8 },
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
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: theme.ink, marginBottom: 12 },
  waiverText: { fontSize: 14, color: theme.inkMuted, lineHeight: 22 },
  cancel: { textAlign: "center", color: theme.inkSubtle, fontWeight: "600" },
});
