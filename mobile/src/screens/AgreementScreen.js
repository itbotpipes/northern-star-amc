// AMC agreement: scrollable clauses; the accept button enables only after the
// customer scrolls to the bottom (mirrors the web click-through flow).
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { theme, fmtDateTime } from "../theme";
import { Card, Btn, Loading, ErrorNote } from "../components/ui";

export default function AgreementScreen({ route, navigation }) {
  const { id } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setError(null); setData(await api.agreement(id)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onScroll = ({ nativeEvent }) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 40) {
      setScrolledEnd(true);
    }
  };

  const accept = async () => {
    setBusy(true);
    try {
      await api.acceptAgreement(id);
      Alert.alert("Agreement accepted", "Thank you!", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) { Alert.alert("Failed", e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  if (data.accepted) {
    return (
      <View style={styles.acceptedWrap}>
        <Card style={{ backgroundColor: theme.successLight, borderColor: theme.success }}>
          <Text style={styles.acceptedTitle}>Agreement accepted</Text>
          <Text style={styles.acceptedBody}>
            You accepted version {data.version} on {fmtDateTime(data.accepted_at)}.
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 20 }} onScroll={onScroll} scrollEventThrottle={100}>
        <Text style={styles.h1}>AMC Maintenance Agreement</Text>
        <Text style={styles.version}>Version {data.version}</Text>
        {data.clauses.map((cl, i) => (
          <Card key={i}>
            <Text style={styles.clauseTitle}>{i + 1}. {cl.title}</Text>
            <Text style={styles.clauseBody}>{cl.body}</Text>
          </Card>
        ))}
        <Text style={styles.endNote}>— End of agreement —</Text>
      </ScrollView>
      <View style={styles.footer}>
        {!scrolledEnd ? <Text style={styles.hint}>Scroll to the bottom to enable acceptance</Text> : null}
        <Btn title="Agree & Continue" variant="success" disabled={!scrolledEnd} loading={busy} onPress={accept} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  h1: { fontSize: 22, fontWeight: "800", color: theme.ink },
  version: { fontSize: 13, color: theme.inkSubtle, marginTop: 2, marginBottom: 14 },
  clauseTitle: { fontSize: 15, fontWeight: "700", color: theme.ink, marginBottom: 6 },
  clauseBody: { fontSize: 14, color: theme.inkMuted, lineHeight: 21 },
  endNote: { textAlign: "center", color: theme.inkSubtle, marginTop: 10, marginBottom: 30 },
  footer: {
    padding: 16, borderTopWidth: 1, borderTopColor: theme.hair, backgroundColor: "#fff", gap: 10,
  },
  hint: { textAlign: "center", fontSize: 13, color: theme.warning },
  acceptedWrap: { flex: 1, backgroundColor: theme.canvas, padding: 16, justifyContent: "center" },
  acceptedTitle: { fontSize: 18, fontWeight: "800", color: theme.success, textAlign: "center" },
  acceptedBody: { fontSize: 14, color: theme.inkMuted, textAlign: "center", marginTop: 8, lineHeight: 20 },
});
