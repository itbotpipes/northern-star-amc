import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Modal, ScrollView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme";

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [staffInfo, setStaffInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checkingPhone, setCheckingPhone] = useState(false);

  // Forgot password modal state
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1: request, 2: reset
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotDevCode, setForgotDevCode] = useState(null);
  const [forgotBusy, setForgotBusy] = useState(false);

  const checkTimerRef = useRef(null);

  // Debounced staff detection
  const checkStaffStatus = async (digits) => {
    if (digits.length !== 10) {
      setStaffInfo(null);
      return;
    }
    setCheckingPhone(true);
    try {
      const res = await api.checkPhone(digits);
      if (res && res.is_staff) {
        setStaffInfo(res);
      } else {
        setStaffInfo(null);
      }
    } catch {
      // offline or silent fail -> keep customer default
      setStaffInfo(null);
    } finally {
      setCheckingPhone(false);
    }
  };

  const handlePhoneChange = (text) => {
    const clean = text.replace(/\D/g, "").slice(0, 10);
    setPhone(clean);

    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);

    if (clean.length === 10) {
      checkTimerRef.current = setTimeout(() => {
        checkStaffStatus(clean);
      }, 200);
    } else {
      setStaffInfo(null);
    }
  };

  const onContinue = async () => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length !== 10) {
      Alert.alert("Invalid number", "Please enter exactly 10 digits for your mobile number.");
      return;
    }

    // Staff Login Flow
    if (staffInfo) {
      if (!password.trim()) {
        Alert.alert("Password Required", "Please enter your staff password.");
        return;
      }
      setBusy(true);
      try {
        const res = await api.staffLogin(clean, password);
        await signIn(res.token, res.user);
      } catch (e) {
        Alert.alert("Login Failed", e.message || "Invalid password for staff account.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // Customer OTP Flow
    setBusy(true);
    try {
      const res = await api.requestOtp(clean);
      if (res.is_staff) {
        setStaffInfo({
          is_staff: true,
          name: res.name,
          role: res.role,
          role_title: res.role_title,
        });
        Alert.alert("Staff Account", "Staff account detected. Please enter your password to continue.");
        return;
      }
      navigation.navigate("Verify", { phone: clean, devCode: res.dev_code });
    } catch (e) {
      Alert.alert("Could not proceed", e.message);
    } finally {
      setBusy(false);
    }
  };

  // Forgot Password: Request OTP
  const onRequestResetOtp = async () => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length !== 10) {
      Alert.alert("Invalid number", "Please enter your 10-digit registered mobile number first.");
      return;
    }
    setForgotBusy(true);
    try {
      const res = await api.forgotPasswordRequest(clean);
      setForgotDevCode(res.dev_code || null);
      if (res.dev_code) setForgotOtp(res.dev_code);
      setForgotStep(2);
    } catch (e) {
      Alert.alert("Reset Error", e.message || "Could not request reset OTP.");
    } finally {
      setForgotBusy(false);
    }
  };

  // Forgot Password: Submit New Password
  const onResetPasswordSubmit = async () => {
    const clean = phone.replace(/\D/g, "");
    if (!forgotOtp.trim() || forgotOtp.trim().length !== 6) {
      Alert.alert("Invalid OTP", "Please enter the 6-digit OTP code.");
      return;
    }
    if (forgotNewPassword.length < 6) {
      Alert.alert("Invalid Password", "Password must be at least 6 characters long.");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      Alert.alert("Mismatch", "New password and confirmation do not match.");
      return;
    }

    setForgotBusy(true);
    try {
      await api.forgotPasswordReset(clean, forgotOtp.trim(), forgotNewPassword);
      Alert.alert("Success", "Password updated successfully! You can now log in with your new password.");
      setForgotModalVisible(false);
      setPassword(forgotNewPassword);
      setForgotStep(1);
    } catch (e) {
      Alert.alert("Reset Failed", e.message || "Invalid OTP code or expired session.");
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.star}>★</Text>
          </View>
          <Text style={styles.company}>Northern Star</Text>
          <Text style={styles.tagline}>Enlightening Safety</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h1}>Sign In</Text>
          <Text style={styles.sub}>
            Enter your mobile number to access your account.
          </Text>

          {/* Staff Account Detected Badge */}
          {staffInfo ? (
            <View style={styles.staffBadge}>
              <View style={styles.badgeIcon}>
                <Ionicons name="checkmark-circle" size={18} color="#17864a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.staffTitle}>Staff Account Detected</Text>
                <Text style={styles.staffSubtitle}>
                  {staffInfo.name} ({staffInfo.role_title || staffInfo.role})
                </Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.label}>Mobile number</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.cc}>+91</Text>
            <TextInput
              style={styles.input}
              placeholder="9876543210"
              keyboardType="number-pad"
              maxLength={10}
              value={phone}
              onChangeText={handlePhoneChange}
              editable={!busy}
            />
            {checkingPhone ? (
              <ActivityIndicator size="small" color={theme.navy} style={{ marginLeft: 6 }} />
            ) : null}
          </View>

          {/* Staff Password Field */}
          {staffInfo ? (
            <View style={{ marginTop: 16 }}>
              <View style={styles.pwdHeader}>
                <Text style={styles.label}>Staff Password</Text>
                <TouchableOpacity
                  onPress={() => {
                    setForgotStep(1);
                    setForgotOtp("");
                    setForgotNewPassword("");
                    setForgotConfirmPassword("");
                    setForgotModalVisible(true);
                  }}
                >
                  <Text style={styles.forgotLink}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.pwdRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter staff password"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  editable={!busy}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={theme.inkSubtle}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, busy && { opacity: 0.6 }]}
            onPress={onContinue}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={theme.ink} />
            ) : (
              <Text style={styles.btnText}>
                {staffInfo ? "Sign In as Staff" : "Send OTP"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal
        visible={forgotModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setForgotModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Staff Password</Text>
              <TouchableOpacity onPress={() => setForgotModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.ink} />
              </TouchableOpacity>
            </View>

            {forgotStep === 1 ? (
              <View>
                <Text style={styles.modalSub}>
                  Send verification OTP to registered mobile number:{"\n"}
                  <Text style={{ fontWeight: "700", color: theme.ink }}>+91 {phone}</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.btn, forgotBusy && { opacity: 0.6 }]}
                  onPress={onRequestResetOtp}
                  disabled={forgotBusy}
                >
                  {forgotBusy ? (
                    <ActivityIndicator color={theme.ink} />
                  ) : (
                    <Text style={styles.btnText}>Send Reset Code</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.modalSub}>
                  Enter the 6-digit OTP code and choose your new password.
                </Text>
                {forgotDevCode ? (
                  <View style={styles.devCodeBox}>
                    <Text style={styles.devCodeLabel}>Dev OTP: </Text>
                    <Text style={styles.devCodeValue}>{forgotDevCode}</Text>
                  </View>
                ) : null}

                <Text style={styles.modalLabel}>Verification Code</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={forgotOtp}
                  onChangeText={setForgotOtp}
                />

                <Text style={styles.modalLabel}>New Password</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="At least 6 characters"
                  secureTextEntry
                  value={forgotNewPassword}
                  onChangeText={setForgotNewPassword}
                />

                <Text style={styles.modalLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Repeat new password"
                  secureTextEntry
                  value={forgotConfirmPassword}
                  onChangeText={setForgotConfirmPassword}
                />

                <TouchableOpacity
                  style={[styles.btn, forgotBusy && { opacity: 0.6 }]}
                  onPress={onResetPasswordSubmit}
                  disabled={forgotBusy}
                >
                  {forgotBusy ? (
                    <ActivityIndicator color={theme.ink} />
                  ) : (
                    <Text style={styles.btnText}>Update Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.navy },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 24 },
  brand: { alignItems: "center", marginBottom: 28 },
  logo: {
    width: 60, height: 60, borderRadius: 16, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  star: { color: theme.navy, fontSize: 32, lineHeight: 36 },
  company: { color: "#fff", fontSize: 24, fontWeight: "700" },
  tagline: { color: "#c9d1f0", fontSize: 13, marginTop: 2 },
  card: { backgroundColor: theme.card, borderRadius: 18, padding: 22 },
  h1: { fontSize: 22, fontWeight: "700", color: theme.ink },
  sub: { color: theme.inkMuted, marginTop: 4, marginBottom: 16, lineHeight: 20, fontSize: 14 },
  staffBadge: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fef3c7",
    borderWidth: 1, borderColor: "#fde68a", borderRadius: 10, padding: 10,
    marginBottom: 16,
  },
  badgeIcon: { marginRight: 8 },
  staffTitle: { fontSize: 12, fontWeight: "700", color: "#92400e" },
  staffSubtitle: { fontSize: 12, color: theme.ink, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "600", color: theme.inkMuted, marginBottom: 6 },
  phoneRow: {
    flexDirection: "row", alignItems: "center", borderWidth: 1,
    borderColor: theme.hair, borderRadius: 10, paddingHorizontal: 12, backgroundColor: "#fff"
  },
  pwdRow: {
    flexDirection: "row", alignItems: "center", borderWidth: 1,
    borderColor: theme.hair, borderRadius: 10, paddingHorizontal: 12, backgroundColor: "#fff"
  },
  pwdHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center"
  },
  forgotLink: {
    fontSize: 12, fontWeight: "600", color: theme.navy, marginBottom: 6
  },
  eyeBtn: { padding: 8 },
  cc: { fontSize: 16, color: theme.ink, marginRight: 8, fontWeight: "600" },
  input: { flex: 1, fontSize: 16, paddingVertical: 14, color: theme.ink },
  btn: {
    backgroundColor: theme.amber, borderRadius: 10, paddingVertical: 15,
    alignItems: "center", marginTop: 20,
  },
  btnText: { color: theme.ink, fontSize: 16, fontWeight: "700" },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 20,
  },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: theme.ink },
  modalSub: { fontSize: 13, color: theme.inkMuted, marginBottom: 16, lineHeight: 18 },
  modalLabel: { fontSize: 12, fontWeight: "600", color: theme.inkMuted, marginTop: 10, marginBottom: 4 },
  modalInput: {
    borderWidth: 1, borderColor: theme.hair, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.ink,
  },
  devCodeBox: {
    flexDirection: "row", backgroundColor: "#fef3c7", padding: 8, borderRadius: 8,
    alignItems: "center", marginBottom: 10,
  },
  devCodeLabel: { fontSize: 12, color: "#92400e", fontWeight: "600" },
  devCodeValue: { fontSize: 13, color: theme.navy, fontWeight: "700", letterSpacing: 1 },
});
