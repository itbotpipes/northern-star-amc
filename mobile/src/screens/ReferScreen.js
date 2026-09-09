// Refer a friend for a contract — feeds the web Referral model.
import React, { useState } from "react";
import { ScrollView, StyleSheet, Alert } from "react-native";
import { theme } from "../theme";
import { api } from "../api/client";
import { Card, Field, Btn, SectionTitle } from "../components/ui";

export default function ReferScreen({ route, navigation }) {
  const { id } = route.params;
  const [form, setForm] = useState({
    referee_name: "", referee_phone: "", referee_company: "", referee_area: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.referee_name.trim() || !form.referee_phone.trim()) {
      Alert.alert("Missing details", "Please add your friend's name and phone number.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.submitReferral(id, form);
      Alert.alert("Thank you!", res.message || "We'll reach out to your referral.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) { Alert.alert("Could not submit", e.message); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16 }}>
      <Card>
        <SectionTitle>Refer a friend</SectionTitle>
        <Field label="Name" value={form.referee_name} onChangeText={set("referee_name")} placeholder="Friend's name" />
        <Field label="Phone" value={form.referee_phone} onChangeText={set("referee_phone")} keyboardType="phone-pad" placeholder="10-digit number" />
        <Field label="Company (optional)" value={form.referee_company} onChangeText={set("referee_company")} />
        <Field label="Area (optional)" value={form.referee_area} onChangeText={set("referee_area")} />
        <Field label="Notes (optional)" value={form.notes} onChangeText={set("notes")} multiline />
        <Btn title="Send referral" variant="primary" loading={busy} onPress={submit} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
});
