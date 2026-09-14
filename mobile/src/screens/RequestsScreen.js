import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, rupees, fmtDate } from "../theme";
import { Card, Pill, Loading, ErrorNote, SectionTitle, Empty, Btn } from "../components/ui";

export default function RequestsScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Modal state for submitting emergency request
  const [modalVisible, setModalVisible] = useState(false);
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const showAlert = (title, msg) => {
    if (Platform.OS === "web") {
      alert(`${title}\n\n${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.requests());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSubmitEmergency = async () => {
    if (!description.trim()) {
      showAlert("Missing Details", "Please describe the emergency or issue.");
      return;
    }
    try {
      setSubmitting(true);
      await api.createServiceRequest({
        request_type: "emergency",
        area: area.trim(),
        description: description.trim(),
      });
      setModalVisible(false);
      setArea("");
      setDescription("");
      showAlert("Emergency Request Sent! ⚡", "Our 24x7 Emergency Fire Team has been dispatched. SLA resolution targeted within 4 hours.");
      load();
    } catch (err) {
      showAlert("Error", err.message || "Failed to send emergency request.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;

  const requests = data.requests || [];
  const refills = data.refills || [];
  const empty = requests.length === 0 && refills.length === 0;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      
      {/* Top Banner CTA for Emergency Request */}
      <Card style={styles.emergencyCtaCard}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={styles.emergencyIconWrap}>
            <Ionicons name="warning" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.emergencyCtaTitle}>24x7 Fire Safety Emergency</Text>
            <Text style={styles.emergencyCtaSub}>Dispatch rapid team with guaranteed 4-hour SLA</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.emergencyBtn} activeOpacity={0.85} onPress={() => setModalVisible(true)}>
          <Ionicons name="flash" size={16} color="#FFFFFF" />
          <Text style={styles.emergencyBtnTxt}>Report Emergency Visit</Text>
        </TouchableOpacity>
      </Card>

      {/* Top Banner CTA for Requesting Refill */}
      <Card style={styles.ctaCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ctaTitle}>Need Fire Extinguisher Refilling?</Text>
          <Text style={styles.ctaSub}>Request on-site refilling or pickup & return for your premises.</Text>
        </View>
        <Btn
          title="+ Request Refill"
          onPress={() => navigation.navigate("RequestRefill")}
          style={{ marginTop: 12 }}
        />
      </Card>

      {empty ? (
        <Empty icon={<Ionicons name="construct-outline" size={40} color={theme.inkSubtle} />}
               title="No requests yet"
               subtitle="Emergency, NOC, and refill requests will appear here." />
      ) : null}

      {requests.length ? <SectionTitle>Emergency & NOC</SectionTitle> : null}
      {requests.map((r) => (
        <Card key={`r${r.id}`}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ref}>{r.reference}</Text>
              <Text style={styles.title}>{r.request_type === "noc" ? "NOC assistance" : "Emergency response"}</Text>
            </View>
            <Pill status={r.status} />
          </View>
          {r.description ? <Text style={styles.desc}>{r.description}</Text> : null}
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{fmtDate(r.created_at)}</Text>
            {r.sla_label ? (
              <View style={styles.slaBadge}>
                <Text style={styles.slaBadgeTxt}>⚡ {r.sla_label}</Text>
              </View>
            ) : null}
          </View>
        </Card>
      ))}

      {refills.length ? <SectionTitle style={{ marginTop: 8 }}>Refill orders</SectionTitle> : null}
      {refills.map((o) => (
        <Card key={`o${o.id}`}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ref}>{o.reference}</Text>
              <Text style={styles.title}>{o.summary || `${o.total_units} unit(s)`}</Text>
            </View>
            <Pill status={o.status} />
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{fmtDate(o.created_at)}</Text>
            {o.amount ? <Text style={styles.meta}>{rupees(o.amount)}</Text> : null}
          </View>
        </Card>
      ))}

      {/* Emergency Request Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="warning" size={22} color="#DC2626" />
                <Text style={styles.modalTitle}>New Emergency Visit</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.inkSubtle} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Submitting an emergency request alerts the fire response team immediately. Target arrival SLA is 4 hours.
            </Text>

            <Text style={styles.inputLabel}>Site / Building Area</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ring Road, Tower B, 3rd Floor"
              value={area}
              onChangeText={setArea}
              placeholderTextColor={theme.inkSubtle}
            />

            <Text style={styles.inputLabel}>Emergency Description *</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: "top" }]}
              placeholder="Describe the emergency (e.g. pressure drop in hydrants, alarm sounding)"
              value={description}
              onChangeText={setDescription}
              multiline
              placeholderTextColor={theme.inkSubtle}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitEmergency} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="flash" size={16} color="#FFFFFF" />
                    <Text style={styles.submitBtnTxt}>Dispatch Now</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  emergencyCtaCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1.5,
    marginBottom: 14,
  },
  emergencyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  emergencyCtaTitle: { fontSize: 16, fontWeight: "800", color: "#991B1B" },
  emergencyCtaSub: { fontSize: 12.5, color: "#7F1D1D", marginTop: 2 },
  emergencyBtn: {
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  emergencyBtnTxt: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  ctaCard: { backgroundColor: "#fff8ec", borderColor: "#f3d8a7", marginBottom: 16 },
  ctaTitle: { fontSize: 16, fontWeight: "700", color: theme.navy },
  ctaSub: { fontSize: 13, color: theme.inkMuted, marginTop: 4, lineHeight: 18 },
  head: { flexDirection: "row", alignItems: "flex-start" },
  ref: { fontSize: 13, fontWeight: "700", color: theme.navy },
  title: { fontSize: 16, fontWeight: "700", color: theme.ink, marginTop: 2 },
  desc: { fontSize: 14, color: theme.inkMuted, marginTop: 8, lineHeight: 20 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  meta: { fontSize: 13, color: theme.inkSubtle },
  slaBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  slaBadgeTxt: { fontSize: 12, fontWeight: "700", color: "#991B1B" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: theme.ink },
  modalSub: { fontSize: 13, color: theme.inkMuted, lineHeight: 18, marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: "700", color: theme.ink, marginBottom: 6 },
  input: {
    backgroundColor: theme.canvas,
    borderWidth: 1,
    borderColor: theme.hair,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: theme.ink,
    marginBottom: 14,
  },
  modalBtnRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.hair,
    alignItems: "center",
  },
  cancelBtnTxt: { fontSize: 14, fontWeight: "600", color: theme.inkMuted },
  submitBtn: {
    flex: 1.5,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  submitBtnTxt: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
});
