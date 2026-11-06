// AMC agreement: scrollable clauses; the tick-mark checkbox unlocks ONLY after the
// customer scrolls to the very bottom, and the accept button enables when checked.
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, fmtDateTime } from "../theme";
import { Card, Btn, Loading, ErrorNote } from "../components/ui";

export default function AgreementScreen({ route, navigation }) {
  const { id } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const [agreedChecked, setAgreedChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.agreement(id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onScroll = ({ nativeEvent }) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    // Detect when reached within 50px of the bottom
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 50) {
      setScrolledEnd(true);
    }
  };

  const handleCheckboxToggle = () => {
    if (!scrolledEnd) {
      Alert.alert(
        "Read Terms First",
        "Please scroll down through the entire agreement to read all clauses before checking the agreement box."
      );
      return;
    }
    setAgreedChecked(!agreedChecked);
  };

  const accept = async () => {
    if (!agreedChecked) {
      Alert.alert("Agreement Required", "Please check the agreement box confirming you have read and agreed to the terms.");
      return;
    }
    setBusy(true);
    try {
      await api.acceptAgreement(id);
      Alert.alert("Agreement Signed! 🎉", "Your digital sign-off is complete. Your AMC coverage and scheduled visits are now active.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert("Failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading text="Loading agreement terms…" />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  if (data?.accepted) {
    return (
      <View style={styles.acceptedWrap}>
        <Card style={{ backgroundColor: theme.colors.emerald + "14", borderColor: theme.colors.emerald, padding: 24, borderRadius: 16 }}>
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <Ionicons name="checkmark-circle" size={48} color={theme.colors.emerald} />
          </View>
          <Text style={styles.acceptedTitle}>Agreement Digitally Signed</Text>
          <Text style={styles.acceptedBody}>
            You accepted version {data.version} on {fmtDateTime(data.accepted_at)}. Your site is fully covered under the agreed maintenance terms.
          </Text>
        </Card>
      </View>
    );
  }

  const clauses = data?.clauses || [];

  return (
    <View style={styles.wrap}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        onScroll={onScroll}
        scrollEventThrottle={100}
      >
        <Text style={styles.h1}>AMC Maintenance Agreement</Text>
        <Text style={styles.version}>Version {data?.version || "1.0"} · Complete Legal Terms & Conditions</Text>

        <View style={styles.instructionsBox}>
          <Ionicons name="information-circle" size={18} color="#D97706" />
          <Text style={styles.instructionsText}>
            Please scroll down and review all clauses. Acceptance checkbox will unlock once you reach the bottom of the document.
          </Text>
        </View>

        {clauses.map((cl, i) => (
          <Card key={i} style={styles.clauseCard}>
            <Text style={styles.clauseTitle}>{i + 1}. {cl.title}</Text>
            <Text style={styles.clauseBody}>{cl.body}</Text>
          </Card>
        ))}

        <View style={styles.endBox}>
          <Text style={styles.endNote}>— End of Agreement Clauses —</Text>
          {scrolledEnd ? (
            <Text style={styles.endUnlocked}>✓ Document completely read. Checkbox unlocked below.</Text>
          ) : (
            <Text style={styles.endLocked}>Scroll to here to unlock the agreement checkbox</Text>
          )}
        </View>
      </ScrollView>

      {/* Footer Gated Action */}
      <View style={styles.footer}>
        {/* Checkbox */}
        <TouchableOpacity
          style={[styles.checkboxRow, !scrolledEnd && styles.checkboxRowDisabled]}
          activeOpacity={0.75}
          onPress={handleCheckboxToggle}
        >
          <View style={[styles.checkbox, agreedChecked && styles.checkboxChecked, !scrolledEnd && styles.checkboxLocked]}>
            {agreedChecked && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            {!scrolledEnd && <Ionicons name="lock-closed" size={12} color="#94A3B8" />}
          </View>
          <Text style={[styles.checkboxLabel, !scrolledEnd && styles.checkboxLabelDisabled]}>
            I have read, understood and agree to all the terms and conditions above.
          </Text>
        </TouchableOpacity>

        {!scrolledEnd ? (
          <Text style={styles.hint}>Scroll all the way down to enable the tick mark</Text>
        ) : null}

        <Btn
          title="Confirm & Sign Agreement"
          variant="success"
          disabled={!scrolledEnd || !agreedChecked}
          loading={busy}
          onPress={accept}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#F8FAFC" },
  h1: { fontSize: 22, fontWeight: "900", color: "#0F172A", letterSpacing: -0.3 },
  version: { fontSize: 13, color: "#64748B", marginTop: 2, marginBottom: 12 },
  instructionsBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  instructionsText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 17, fontWeight: "500" },
  clauseCard: { marginBottom: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  clauseTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A", marginBottom: 6 },
  clauseBody: { fontSize: 13, color: "#475569", lineHeight: 20 },
  endBox: { alignItems: "center", marginVertical: 20 },
  endNote: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  endUnlocked: { fontSize: 12, fontWeight: "700", color: "#059669", marginTop: 6 },
  endLocked: { fontSize: 12, fontWeight: "600", color: "#D97706", marginTop: 6 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    gap: 10,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  checkboxRowDisabled: {
    opacity: 0.6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.navy,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkboxChecked: {
    backgroundColor: theme.colors.navy,
    borderColor: theme.colors.navy,
  },
  checkboxLocked: {
    borderColor: "#CBD5E1",
    backgroundColor: "#F1F5F9",
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    color: "#1E293B",
    fontWeight: "600",
    lineHeight: 18,
  },
  checkboxLabelDisabled: {
    color: "#64748B",
  },
  hint: { textAlign: "center", fontSize: 12, color: "#D97706", fontWeight: "600" },
  acceptedWrap: { flex: 1, backgroundColor: "#F8FAFC", padding: 16, justifyContent: "center" },
  acceptedTitle: { fontSize: 19, fontWeight: "900", color: "#065F46", textAlign: "center" },
  acceptedBody: { fontSize: 13, color: "#475569", textAlign: "center", marginTop: 8, lineHeight: 20 },
});
