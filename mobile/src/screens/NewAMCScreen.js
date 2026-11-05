// New AMC Application Form — customer-initiated enquiry for an Annual Maintenance Contract.
import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { theme, rupees } from "../theme";
import { Card, Field, Btn, SectionTitle } from "../components/ui";

const PROPERTY_TYPES = [
  "Residential Building",
  "Commercial Complex",
  "Industrial / Factory",
  "Hospital / Clinic",
  "Educational Institute",
  "Other",
];

export default function NewAMCScreen({ navigation }) {
  const { user } = useAuth();
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState(user?.address || "");
  const [area, setArea] = useState(user?.area || "");
  const [propertyType, setPropertyType] = useState(PROPERTY_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [plans, setPlans] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.plans()
      .then((res) => {
        if (mounted && res?.plans) {
          setPlans(res.plans);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async () => {
    if (!siteName.trim()) {
      Alert.alert("Missing Details", "Please enter the Building / Site Name.");
      return;
    }

    setSubmitting(true);
    try {
      await api.applyAMC({
        site_name: siteName.trim(),
        site_address: siteAddress.trim(),
        area: area.trim(),
        property_type: propertyType,
        notes: notes.trim(),
        plan_id: selectedPlanId,
      });

      Alert.alert(
        "Application Submitted! 🎉",
        "Our engineering team has received your AMC request. A technician will contact you to schedule an on-site safety audit.",
        [{ text: "View Dashboard", onPress: () => navigation.navigate("Home") }]
      );
    } catch (e) {
      Alert.alert("Submission Failed", e.message || "Could not submit enquiry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>
      {/* Intro Hero Banner */}
      <View style={styles.heroBanner}>
        <View style={styles.heroIconBox}>
          <Ionicons name="shield-checkmark" size={26} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Request a New AMC</Text>
          <Text style={styles.heroSub}>
            Annual Maintenance Contract for complete fire-safety compliance, regular inspections & 24x7 emergency response.
          </Text>
        </View>
      </View>

      {/* Building & Site Details */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>Site & Building Information</SectionTitle>
        <Field
          label="Building / Society / Plant Name *"
          placeholder="e.g. Shivalik Residency or Om Tower"
          value={siteName}
          onChangeText={setSiteName}
        />
        <Field
          label="Full Site Address"
          placeholder="Street, Landmark, City"
          value={siteAddress}
          onChangeText={setSiteAddress}
          multiline
        />
        <Field
          label="Area / Locality"
          placeholder="e.g. Vesu, Adajan, Ring Road"
          value={area}
          onChangeText={setArea}
        />

        <Text style={styles.label}>Premises Category</Text>
        <View style={styles.typeWrap}>
          {PROPERTY_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setPropertyType(t)}
              activeOpacity={0.8}
              style={[styles.typeChip, propertyType === t && styles.typeChipActive]}
            >
              <Text style={[styles.typeText, propertyType === t && styles.typeTextActive]}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* Select Preferred Plan (Optional) */}
      {plans.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <SectionTitle>Select Preferred Plan (Optional)</SectionTitle>
          <Text style={styles.planHint}>
            Choose a starting plan or let our technician recommend one following the site safety inspection.
          </Text>
          <View style={styles.planGrid}>
            {plans.map((p) => {
              const selected = selectedPlanId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.85}
                  onPress={() => setSelectedPlanId(selected ? null : p.id)}
                  style={[styles.planCard, selected && styles.planCardActive]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planName, selected && styles.planNameActive]}>{p.name}</Text>
                    <Text style={styles.planVisits}>{p.visits} Visits / Year · {p.response_time || "4h Response"}</Text>
                  </View>
                  <Text style={[styles.planPrice, selected && styles.planPriceActive]}>
                    {rupees(p.price)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
      )}

      {/* Additional Requirements */}
      <Card style={{ marginBottom: 18 }}>
        <SectionTitle>Specific Requirements or Notes</SectionTitle>
        <Field
          label="Notes for Engineering Team"
          placeholder="Mention equipment installed, previous AMC history, NOC renewal needs, or preferred audit timing…"
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </Card>

      {/* Contact Summary Box */}
      <View style={styles.contactNotice}>
        <Ionicons name="information-circle-outline" size={18} color={theme.navy} style={{ marginTop: 2 }} />
        <Text style={styles.contactNoticeText}>
          Enquiry will be linked to your verified account: <Text style={{ fontWeight: "700" }}>{user?.name}</Text> ({user?.phone}).
        </Text>
      </View>

      <Btn
        title="Submit AMC Application"
        variant="navy"
        loading={submitting}
        onPress={handleSubmit}
        style={{ marginTop: 14 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  heroBanner: {
    backgroundColor: theme.navy,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  heroIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  heroTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, lineHeight: 17, marginTop: 3 },
  label: { color: theme.inkMuted, fontSize: 13, fontWeight: "600", marginBottom: 8 },
  typeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.hair,
    backgroundColor: "#FFFFFF",
  },
  typeChipActive: { borderColor: theme.navy, backgroundColor: theme.navy + "12" },
  typeText: { fontSize: 12, color: theme.inkMuted, fontWeight: "500" },
  typeTextActive: { color: theme.navy, fontWeight: "700" },
  planHint: { fontSize: 12, color: theme.inkSubtle, marginBottom: 12, marginTop: -4 },
  planGrid: { gap: 8 },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.hair,
    backgroundColor: "#FFFFFF",
  },
  planCardActive: {
    borderColor: theme.navy,
    backgroundColor: theme.navy + "0c",
  },
  planName: { fontSize: 14, fontWeight: "700", color: theme.ink },
  planNameActive: { color: theme.navy },
  planVisits: { fontSize: 11, color: theme.inkSubtle, marginTop: 2 },
  planPrice: { fontSize: 14, fontWeight: "800", color: theme.ink },
  planPriceActive: { color: theme.navy },
  contactNotice: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: theme.navy + "10",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.navy + "25",
  },
  contactNoticeText: { fontSize: 12, color: theme.navy, flex: 1, lineHeight: 17 },
});

