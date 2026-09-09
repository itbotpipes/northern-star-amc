// Raise a new complaint / support ticket.
import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from "react-native";
import { api } from "../api/client";
import { theme } from "../theme";
import { Card, Field, Btn, SectionTitle } from "../components/ui";

const PRIORITIES = ["low", "normal", "high"];

export default function RaiseTicketScreen({ route, navigation }) {
  const contractId = route.params?.contract_id || null;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert("Missing details", "Please add a title and description.");
      return;
    }
    setBusy(true);
    try {
      await api.raiseTicket({
        title: title.trim(), description: description.trim(),
        priority, contract_id: contractId,
      });
      Alert.alert("Complaint raised", "Our team will respond within 24 hours.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert("Could not submit", e.message);
    } finally { setBusy(false); }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card>
        <SectionTitle>What's the issue?</SectionTitle>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Extinguisher pressure low" />
        <Field label="Description" value={description} onChangeText={setDescription}
               placeholder="Describe the problem in detail…" multiline />

        <Text style={styles.label}>Priority</Text>
        <View style={styles.priRow}>
          {PRIORITIES.map((p) => (
            <TouchableOpacity key={p} onPress={() => setPriority(p)}
              style={[styles.priChip, priority === p && styles.priChipActive]}>
              <Text style={[styles.priText, priority === p && styles.priTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Btn title="Submit complaint" variant="danger" loading={busy} onPress={submit} style={{ marginTop: 8 }} />
      </Card>
      <Text style={styles.note}>
        Our team is notified immediately. If you don't hear back within 24 hours, you can send a
        reminder from the complaint page.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  label: { color: theme.inkMuted, fontSize: 13, fontWeight: "600", marginBottom: 8 },
  priRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  priChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: theme.hair, backgroundColor: "#fff",
  },
  priChipActive: { borderColor: theme.amber, backgroundColor: theme.amberLight },
  priText: { fontSize: 14, color: theme.inkMuted, textTransform: "capitalize", fontWeight: "600" },
  priTextActive: { color: theme.amberDark },
  note: { fontSize: 13, color: theme.inkSubtle, lineHeight: 20, paddingHorizontal: 4 },
});
