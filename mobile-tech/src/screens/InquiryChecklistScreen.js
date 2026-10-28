import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme } from "../theme";
import { Loading, ErrorNote, Pill, Button } from "../components/ui";

const DEFAULT_INQUIRY_CATEGORIES = [
  {
    category: "Fire Extinguishers",
    items: [
      "Extinguisher mounting, accessibility & signage clear",
      "Pressure gauge needle in operable green zone",
      "Safety pin & tamper seal intact",
      "Physical condition, hose & discharge nozzle free of blockage",
      "Hydro-test & annual refill date validity",
    ],
  },
  {
    category: "Fire Hydrant & Hose Reel System",
    items: [
      "Landing valves operation & handwheel smoothness",
      "Hose reel drum rotation & nozzle shut-off operation",
      "RRL hose pipe condition, couplings & washers",
      "Booster pump auto-start pressure & cut-in check",
    ],
  },
  {
    category: "Fire Alarm & Detection System",
    items: [
      "Main Fire Alarm Control Panel (FACP) AC power & battery backup",
      "Smoke / Heat detector sample trigger test",
      "Manual Call Point (MCP) condition & break-glass access",
      "Hooters & sounders audibility check",
    ],
  },
  {
    category: "Fire Sprinkler System",
    items: [
      "Main control valve open, chained & locked",
      "Sprinkler head clearance (min 0.5m around deflectors)",
      "System pressure gauge reading steady",
    ],
  },
  {
    category: "Pump Room & Booster Pumps",
    items: [
      "Jockey pump automatic cut-in & cut-out operation",
      "Main electrical fire pump test run & vibration check",
      "Diesel engine pump fuel, oil level & battery start check",
    ],
  },
  {
    category: "Emergency Lighting & Signage",
    items: [
      "Illuminated EXIT signs operational on mains & battery",
      "Evacuation route maps mounted at key locations",
    ],
  },
  {
    category: "Passive Fire Protection",
    items: [
      "Fire rated doors self-closing mechanism & latching",
      "Shaft and wall penetration fire sealing condition",
    ],
  },
];

export default function InquiryChecklistScreen({ route, navigation }) {
  const { id } = route.params;
  const [inquiry, setInquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [techNotes, setTechNotes] = useState("");
  const [checks, setChecks] = useState({});

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const res = await api.inquiry(id);
      const inq = res.inquiry || {};
      setInquiry(inq);
      setTechNotes(inq.technician_notes || "");

      // Initialise checks map
      const initial = {};
      if (inq.checklist_items && inq.checklist_items.length > 0) {
        inq.checklist_items.forEach((item, idx) => {
          initial[idx] = {
            category: item.category,
            item_name: item.item_name,
            status: item.status || "pass",
            remarks: item.remarks || "",
            recommendation: item.recommendation || "",
          };
        });
      } else {
        let count = 0;
        DEFAULT_INQUIRY_CATEGORIES.forEach((cat) => {
          cat.items.forEach((itemTitle) => {
            initial[count] = {
              category: cat.category,
              item_name: itemTitle,
              status: "pass",
              remarks: "",
              recommendation: "",
            };
            count++;
          });
        });
      }
      setChecks(initial);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateItemStatus = (idx, status) => {
    setChecks((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], status },
    }));
  };

  const updateItemField = (idx, field, value) => {
    setChecks((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], [field]: value },
    }));
  };

  const markInProgress = async () => {
    try {
      await api.updateInquiryStatus(id, "site_visit_in_progress", "Technician arrived on site.");
      Alert.alert("Status Updated", "Site visit is now marked In Progress.");
      loadData();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const submitChecklist = async () => {
    const itemsList = Object.values(checks);
    if (itemsList.length === 0) {
      Alert.alert("Error", "No checklist items to submit.");
      return;
    }

    try {
      setSubmitting(true);
      await api.submitInquiryChecklist(id, itemsList, techNotes);
      Alert.alert(
        "Inspection Submitted!",
        "The visit checklist has been submitted. The Team Leader has been notified and can now generate the quotation.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert("Submission Failed", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading text="Loading inspection checklist…" />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); loadData(); }} />;
  if (!inquiry) return null;

  // Group current checks by category
  const grouped = {};
  Object.keys(checks).forEach((k) => {
    const item = checks[k];
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push({ key: k, ...item });
  });

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Customer & Site Card */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.refText}>{inquiry.reference || `INQ-${inquiry.id}`}</Text>
          <Pill
            label={inquiry.status_label || inquiry.status}
            tone={inquiry.status === "checklist_submitted" ? "ok" : "warn"}
          />
        </View>

        <Text style={styles.custName}>{inquiry.customer_name}</Text>
        <Text style={styles.serviceText}>{inquiry.service_requirement}</Text>

        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={15} color={theme.inkSubtle} />
          <Text style={styles.infoText}>
            {[inquiry.address, inquiry.area, inquiry.city].filter(Boolean).join(", ")}
          </Text>
        </View>

        {inquiry.phone ? (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => Linking.openURL(`tel:${inquiry.phone}`)}
          >
            <Ionicons name="call" size={14} color="#fff" />
            <Text style={styles.actionBtnText}>Call Customer ({inquiry.phone})</Text>
          </TouchableOpacity>
        ) : null}

        {inquiry.team_leader_notes ? (
          <View style={styles.leaderNoteBox}>
            <Text style={styles.leaderNoteTitle}>Team Leader Instructions:</Text>
            <Text style={styles.leaderNoteText}>{inquiry.team_leader_notes}</Text>
          </View>
        ) : null}

        {inquiry.status === "site_visit_scheduled" ? (
          <TouchableOpacity style={styles.startBtn} onPress={markInProgress}>
            <Ionicons name="play" size={14} color="#fff" />
            <Text style={styles.startBtnText}>Start Site Inspection</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Checklist Sections */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Site Inspection Checklist</Text>
        <Text style={styles.sectionSub}>Review each safety category below</Text>
      </View>

      {Object.keys(grouped).map((catName) => (
        <View key={catName} style={styles.categoryCard}>
          <View style={styles.catTitleRow}>
            <Ionicons name="shield-checkmark" size={16} color={theme.navy} />
            <Text style={styles.catTitle}>{catName}</Text>
          </View>

          {grouped[catName].map((item) => {
            const isAttention = item.status === "attention";
            const isFail = item.status === "fail";
            return (
              <View key={item.key} style={styles.itemBox}>
                <Text style={styles.itemTitle}>{item.item_name}</Text>

                {/* Status Options */}
                <View style={styles.toggleRow}>
                  {["pass", "attention", "fail", "na"].map((st) => {
                    const active = item.status === st;
                    const color =
                      st === "pass" ? theme.success :
                      st === "attention" ? theme.amber :
                      st === "fail" ? theme.danger : "#64748b";
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[
                          styles.toggleBtn,
                          active && { backgroundColor: color, borderColor: color },
                        ]}
                        onPress={() => updateItemStatus(item.key, st)}
                      >
                        <Text style={[styles.toggleText, active && { color: "#fff", fontWeight: "700" }]}>
                          {st === "pass" ? "Pass" :
                           st === "attention" ? "Attention" :
                           st === "fail" ? "Defect" : "N/A"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Remarks & Recommendation for Defect / Attention */}
                {(isAttention || isFail) ? (
                  <View style={styles.defectInputGroup}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Observation / Defect details..."
                      placeholderTextColor="#94a3b8"
                      value={item.remarks}
                      onChangeText={(val) => updateItemField(item.key, "remarks", val)}
                    />
                    <TextInput
                      style={[styles.textInput, { marginTop: 6 }]}
                      placeholder="Recommended action / repair scope..."
                      placeholderTextColor="#94a3b8"
                      value={item.recommendation}
                      onChangeText={(val) => updateItemField(item.key, "recommendation", val)}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}

      {/* Technician Overall Remarks */}
      <View style={styles.card}>
        <Text style={styles.catTitle}>Technician Site Summary</Text>
        <TextInput
          style={[styles.textInput, { height: 80, marginTop: 10 }]}
          placeholder="Overall facility observations, pump room state, quotation suggestions..."
          placeholderTextColor="#94a3b8"
          multiline
          value={techNotes}
          onChangeText={setTechNotes}
        />
      </View>

      {/* Submit Button */}
      <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
        <Button
          label={submitting ? "Submitting Checklist…" : "Submit Inspection Checklist"}
          tone="navy"
          onPress={submitChecklist}
          disabled={submitting}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#f8fafc" },
  card: {
    backgroundColor: "#fff", marginHorizontal: 16, marginTop: 16,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#e2e8f0",
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  refText: { fontSize: 13, fontWeight: "700", color: theme.navy },
  custName: { fontSize: 18, fontWeight: "800", color: "#0f172a", marginTop: 6 },
  serviceText: { fontSize: 13, fontWeight: "600", color: theme.navy, marginTop: 2 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  infoText: { fontSize: 12, color: "#64748b", flex: 1 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: theme.navy, borderRadius: 10, paddingVertical: 8, marginTop: 12,
  },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  startBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: theme.success, borderRadius: 10, paddingVertical: 10, marginTop: 10,
  },
  startBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  leaderNoteBox: {
    backgroundColor: "#eff6ff", borderRadius: 10, padding: 10, marginTop: 12,
    borderWidth: 1, borderColor: "#dbeafe",
  },
  leaderNoteTitle: { fontSize: 11, fontWeight: "700", color: "#1e40af" },
  leaderNoteText: { fontSize: 12, color: "#1e3a8a", marginTop: 2 },
  sectionHeader: { marginHorizontal: 16, marginTop: 24, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  sectionSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  categoryCard: {
    backgroundColor: "#fff", marginHorizontal: 16, marginTop: 12,
    borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#e2e8f0",
  },
  catTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  catTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  itemBox: {
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  itemTitle: { fontSize: 12, fontWeight: "600", color: "#1e293b", marginBottom: 8 },
  toggleRow: { flexDirection: "row", gap: 6 },
  toggleBtn: {
    flex: 1, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
    borderColor: "#cbd5e1", alignItems: "center", backgroundColor: "#fff",
  },
  toggleText: { fontSize: 11, color: "#475569", fontWeight: "500" },
  defectInputGroup: { marginTop: 8 },
  textInput: {
    backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: "#0f172a",
  },
});
