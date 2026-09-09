// Support ticket detail: conversation status, staff reply, and re-trigger.
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { theme, fmtDateTime } from "../theme";
import { Card, Pill, Btn, Loading, ErrorNote, SectionTitle } from "../components/ui";

export default function TicketDetailScreen({ route }) {
  const { id } = route.params;
  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setError(null); const { ticket } = await api.ticket(id); setT(ticket); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const retrigger = async () => {
    setBusy(true);
    try { await api.retriggerTicket(id); Alert.alert("Reminder sent", "Our team has been notified again."); load(); }
    catch (e) { Alert.alert("Could not send", e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card>
        <View style={styles.head}>
          <Text style={styles.ref}>{t.reference}</Text>
          <Pill status={t.status} label={t.status_label} />
        </View>
        <Text style={styles.title}>{t.title}</Text>
        <Text style={styles.date}>Raised {fmtDateTime(t.created_at)}</Text>
      </Card>

      <Card>
        <SectionTitle>Your complaint</SectionTitle>
        <Text style={styles.body}>{t.description}</Text>
        {t.voice_note ? (
          <Text style={styles.voice}>Voice note: "{t.voice_note}"</Text>
        ) : null}
      </Card>

      {t.staff_reply ? (
        <Card style={{ backgroundColor: theme.successLight, borderColor: theme.success }}>
          <SectionTitle style={{ color: theme.success }}>Our response</SectionTitle>
          <Text style={styles.body}>{t.staff_reply}</Text>
          {t.replied_at ? <Text style={styles.date}>{fmtDateTime(t.replied_at)}</Text> : null}
        </Card>
      ) : (
        <Card style={{ backgroundColor: theme.warningLight, borderColor: theme.warning }}>
          <Text style={styles.awaiting}>Awaiting our team's response.</Text>
          {t.resolved_at ? null : t.can_retrigger ? (
            <Btn title="Send a reminder" variant="navy" loading={busy} onPress={retrigger} style={{ marginTop: 12 }} />
          ) : (
            <Text style={styles.hint}>You can send a reminder if there's no reply within 24 hours.</Text>
          )}
        </Card>
      )}

      {t.resolved_at ? (
        <Card>
          <Text style={{ color: theme.success, fontWeight: "700", textAlign: "center" }}>
            Resolved on {fmtDateTime(t.resolved_at)}
          </Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  ref: { fontSize: 13, fontWeight: "700", color: theme.navy },
  title: { fontSize: 18, fontWeight: "800", color: theme.ink },
  date: { fontSize: 13, color: theme.inkSubtle, marginTop: 6 },
  body: { fontSize: 15, color: theme.ink, lineHeight: 22 },
  voice: { fontSize: 14, color: theme.inkMuted, fontStyle: "italic", marginTop: 10 },
  awaiting: { fontSize: 15, fontWeight: "700", color: theme.warning },
  hint: { fontSize: 13, color: theme.inkMuted, marginTop: 8, lineHeight: 20 },
});
