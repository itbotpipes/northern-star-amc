import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme";

// Technician / staff login — email + password, mirrors the web app's
// /auth/staff route but returns a bearer token instead of a session cookie.
export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Enter your work email and password.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.staffLogin(email.trim(), password);
      await signIn(res.token, res.user);
    } catch (e) {
      Alert.alert("Could not sign in", e.message);
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
        <Text style={styles.tagline}>Technician App</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h1}>Technician Login</Text>
        <Text style={styles.sub}>Sign in with your Northern Star work account.</Text>

        <Text style={styles.label}>Work email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@northernstar.example"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          editable={!busy}
        />

        <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!busy}
        />

        <TouchableOpacity
          style={[styles.btn, busy && { opacity: 0.6 }]}
          onPress={onLogin}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#1b1c22" />
          ) : (
            <Text style={styles.btnText}>Sign in</Text>
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
  input: {
    borderWidth: 1, borderColor: theme.hair, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: theme.ink,
  },
  btn: {
    backgroundColor: theme.amber, borderRadius: 10, paddingVertical: 15,
    alignItems: "center", marginTop: 22,
  },
  btnText: { color: theme.ink, fontSize: 16, fontWeight: "700" },
});
