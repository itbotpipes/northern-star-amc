import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from "react-native";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme";

// Step 2 of customer login: enter the OTP -> get a token -> sign in.
export default function VerifyScreen({ route }) {
  const { phone, devCode } = route.params;
  const { signIn } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Dev convenience: auto-fill the code the API returned (no SMS gateway yet).
  useEffect(() => {
    if (devCode) setCode(String(devCode));
  }, [devCode]);

  const onVerify = async () => {
    if (code.length < 4) {
      Alert.alert("Enter the code", "Type the OTP you received.");
      return;
    }
    setBusy(true);
    try {
      const { token, user } = await api.verifyOtp(phone, code.trim());
      await signIn(token, user); // flips the navigator to the Dashboard
    } catch (e) {
      Alert.alert("Verification failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.h1}>Enter OTP</Text>
      <Text style={styles.sub}>Sent to +91 {phone}</Text>

      {devCode ? (
        <Text style={styles.dev}>Dev code: {devCode}</Text>
      ) : null}

      <TextInput
        style={styles.otp}
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={setCode}
        placeholder="––––––"
        textAlign="center"
        editable={!busy}
      />

      <TouchableOpacity
        style={[styles.btn, busy && { opacity: 0.6 }]}
        onPress={onVerify}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={theme.ink} />
        ) : (
          <Text style={styles.btnText}>Verify & Continue</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas, padding: 24 },
  h1: { fontSize: 22, fontWeight: "700", color: theme.ink, marginTop: 12 },
  sub: { color: theme.inkMuted, marginTop: 6 },
  dev: {
    marginTop: 14, color: theme.warning, backgroundColor: "#fbf0dc",
    padding: 10, borderRadius: 8, overflow: "hidden", fontWeight: "600",
  },
  otp: {
    fontSize: 32, letterSpacing: 8, borderWidth: 1, borderColor: theme.hair,
    borderRadius: 12, paddingVertical: 16, marginTop: 24, backgroundColor: "#fff",
    color: theme.ink,
  },
  btn: {
    backgroundColor: theme.amber, borderRadius: 10, paddingVertical: 15,
    alignItems: "center", marginTop: 24,
  },
  btnText: { color: theme.ink, fontSize: 16, fontWeight: "700" },
});
