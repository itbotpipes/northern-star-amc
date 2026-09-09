import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { api } from "../api/client";
import { theme } from "../theme";

// Step 1 of customer login: enter phone number -> request an OTP.
export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const onContinue = async () => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10) {
      Alert.alert("Invalid number", "Enter your 10-digit mobile number.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.requestOtp(clean);
      // dev_code is only returned while there is no SMS gateway wired up.
      navigation.navigate("Verify", { phone: clean, devCode: res.dev_code });
    } catch (e) {
      Alert.alert("Could not send OTP", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Text style={styles.star}>★</Text>
        </View>
        <Text style={styles.company}>Northern Star</Text>
        <Text style={styles.tagline}>Enlightening Safety</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h1}>Customer Login</Text>
        <Text style={styles.sub}>
          We'll text a one-time code to your registered mobile number.
        </Text>

        <Text style={styles.label}>Mobile number</Text>
        <View style={styles.phoneRow}>
          <Text style={styles.cc}>+91</Text>
          <TextInput
            style={styles.input}
            placeholder="98765 43210"
            keyboardType="number-pad"
            maxLength={10}
            value={phone}
            onChangeText={setPhone}
            editable={!busy}
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, busy && { opacity: 0.6 }]}
          onPress={onContinue}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={theme.ink} />
          ) : (
            <Text style={styles.btnText}>Send OTP</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.navy, justifyContent: "center", padding: 24 },
  brand: { alignItems: "center", marginBottom: 32 },
  logo: {
    width: 64, height: 64, borderRadius: 16, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  star: { color: theme.navy, fontSize: 34, lineHeight: 38 },
  company: { color: "#fff", fontSize: 24, fontWeight: "700" },
  tagline: { color: "#c9d1f0", fontSize: 13, marginTop: 2 },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 22 },
  h1: { fontSize: 20, fontWeight: "700", color: theme.ink },
  sub: { color: theme.inkMuted, marginTop: 6, marginBottom: 18, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: "600", color: theme.inkMuted, marginBottom: 6 },
  phoneRow: {
    flexDirection: "row", alignItems: "center", borderWidth: 1,
    borderColor: theme.hair, borderRadius: 10, paddingHorizontal: 12,
  },
  cc: { fontSize: 16, color: theme.ink, marginRight: 8, fontWeight: "600" },
  input: { flex: 1, fontSize: 16, paddingVertical: 14, color: theme.ink },
  btn: {
    backgroundColor: theme.amber, borderRadius: 10, paddingVertical: 15,
    alignItems: "center", marginTop: 22,
  },
  btnText: { color: theme.ink, fontSize: 16, fontWeight: "700" },
});
