// Profile: view + edit the customer's details, plus sign out.
import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme";
import { Card, Field, Btn, SectionTitle } from "../components/ui";

export default function ProfileScreen({ navigation }) {
  const { user, signOut, refresh } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || "", email: user?.email || "", area: user?.area || "",
    city: user?.city || "", address: user?.address || "",
    company_name: user?.company_name || "", gst_number: user?.gst_number || "",
  });
  const [busy, setBusy] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await api.updateMe(form);
      if (refresh) await refresh();
      Alert.alert("Saved", "Your profile has been updated.");
    } catch (e) {
      Alert.alert("Could not save", e.message);
    } finally { setBusy(false); }
  };

  const initials = (user?.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.phone}>+91 {user?.phone}</Text>
      </View>

      <Card>
        <SectionTitle>Personal details</SectionTitle>
        <Field label="Full name" value={form.name} onChangeText={set("name")} />
        <Field label="Email" value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Area" value={form.area} onChangeText={set("area")} />
        <Field label="City" value={form.city} onChangeText={set("city")} />
        <Field label="Address" value={form.address} onChangeText={set("address")} multiline />
      </Card>

      <Card>
        <SectionTitle>Business (optional)</SectionTitle>
        <Field label="Company name" value={form.company_name} onChangeText={set("company_name")} />
        <Field label="GST number" value={form.gst_number} onChangeText={set("gst_number")} autoCapitalize="characters" />
      </Card>

      <Btn title="Save changes" variant="primary" loading={busy} onPress={save} style={{ marginBottom: 12 }} />
      <Btn title="Sign out" variant="ghost" onPress={() =>
        Alert.alert("Sign out", "Are you sure?", [
          { text: "Cancel", style: "cancel" },
          { text: "Sign out", style: "destructive", onPress: signOut },
        ])} />

      <View style={styles.footer}>
        <Ionicons name="shield-checkmark" size={16} color={theme.inkSubtle} />
        <Text style={styles.footerText}>Northern Star Engineering · Enlightening Safety</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  header: { alignItems: "center", marginBottom: 20 },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: theme.navy,
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  avatarText: { color: "#fff", fontSize: 26, fontWeight: "800" },
  name: { fontSize: 20, fontWeight: "800", color: theme.ink },
  phone: { fontSize: 14, color: theme.inkSubtle, marginTop: 2 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 24 },
  footerText: { fontSize: 12, color: theme.inkSubtle },
});
