// New AMC Application Form / Send Enquiry — exact mirror of the WebApp's Send Enquiry (site/apply.html).
import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity, TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme";
import { Card, Field, Btn } from "../components/ui";

const PROPERTY_TYPES = [
  "Residential apartment",
  "Independent house / villa",
  "Housing society",
  "Shop / showroom",
  "Office",
  "Commercial complex",
  "Industrial unit",
  "Other",
];

export default function NewAMCScreen({ navigation }) {
  const { user } = useAuth();

  // Contact fields (auto-filled from logged-in customer)
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState(user?.email || "");

  // Existing sites (if customer already has registered sites)
  const [existingSites, setExistingSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");

  // Site details
  const [siteName, setSiteName] = useState("");
  const [area, setArea] = useState(user?.area || "");
  const [siteAddress, setSiteAddress] = useState(user?.address || "");
  const [propertyType, setPropertyType] = useState(PROPERTY_TYPES[0]);

  // Geolocation
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locStatus, setLocStatus] = useState("");

  // Issue / Voice
  const [problemDescription, setProblemDescription] = useState("");
  const [voiceNote, setVoiceNote] = useState("");

  const [submitting, setSubmitting] = useState(false);

  // Load customer's existing sites on mount
  useEffect(() => {
    let mounted = true;
    api.contracts()
      .then((res) => {
        if (mounted && res?.contracts?.length > 0) {
          setExistingSites(res.contracts);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  // When customer chooses an existing site or "A new site"
  const handleSiteChoice = (siteId) => {
    setSelectedSiteId(siteId);
    if (!siteId) {
      // Reset to new site
      setSiteName("");
      setArea(user?.area || "");
      setSiteAddress(user?.address || "");
      setLatitude("");
      setLongitude("");
      setLocStatus("");
      return;
    }

    const s = existingSites.find((c) => String(c.id) === String(siteId));
    if (s) {
      setSiteName(s.site_name || "");
      setArea(s.area || "");
      setSiteAddress(s.site_address || "");
      if (s.property_type && PROPERTY_TYPES.includes(s.property_type)) {
        setPropertyType(s.property_type);
      }
      if (s.latitude && s.longitude) {
        setLatitude(String(s.latitude));
        setLongitude(String(s.longitude));
        setLocStatus("Location saved ✓");
      } else {
        setLatitude("");
        setLongitude("");
        setLocStatus("");
      }
    }
  };

  // Browser/device geolocation capture (same as webapp's useLocationBtn)
  const handleUseCurrentLocation = () => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      setLocStatus("Getting your location…");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude.toFixed(6);
          const lng = pos.coords.longitude.toFixed(6);
          setLatitude(lat);
          setLongitude(lng);
          setLocStatus(`Location captured ✓ (${lat}, ${lng})`);
        },
        (err) => {
          setLocStatus("Location access denied or unavailable.");
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      Alert.alert("GPS Location", "Geolocation is not supported on this browser or platform.");
    }
  };

  const handlePhoneChange = (t) => {
    const cleaned = t.replace(/\D/g, "").slice(0, 10);
    setPhone(cleaned);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert("Missing Name", "Please enter your name.");
      return;
    }
    if (phone.trim().length !== 10) {
      Alert.alert("Invalid Phone", "Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!siteName.trim()) {
      Alert.alert("Missing Site", "Please enter the Site / Building Name.");
      return;
    }

    setSubmitting(true);
    try {
      await api.applyAMC({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        site_name: siteName.trim(),
        site_address: siteAddress.trim(),
        area: area.trim(),
        property_type: propertyType,
        problem_description: problemDescription.trim(),
        voice_note: voiceNote.trim(),
        latitude,
        longitude,
        existing_site_id: selectedSiteId || null,
      });

      Alert.alert(
        "Enquiry Sent! 🎉",
        "Our technician will visit, inspect your site, and share a quotation — no payment now.",
        [{ text: "OK", onPress: () => navigation.navigate("Home") }]
      );
    } catch (e) {
      Alert.alert("Submission Failed", e.message || "Could not submit enquiry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      {/* Header section matching webapp */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>NEW ENQUIRY</Text>
        <Text style={styles.title}>Send an enquiry</Text>
        <Text style={styles.subtitle}>
          Tell us about your site and leave the rest to us. Our maintenance manager will schedule a site inspection, share a full report, and follow up with a quotation — no need to pick a plan yourself. You can also use the voice note if you find it easier to speak than type.
        </Text>
      </View>

      {/* Signed-in Banner */}
      {user && (
        <View style={styles.signedInBox}>
          <Ionicons name="person-circle-outline" size={20} color={theme.colors.navy} />
          <Text style={styles.signedInText}>
            Signed in as <Text style={{ fontWeight: "700", color: theme.colors.navy }}>{user.name || "Customer"}</Text>. We've filled in your contact details below — edit any of them here if something has changed.
          </Text>
        </View>
      )}

      {/* Which site is this about? (If customer has existing sites) */}
      {existingSites.length > 0 && (
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Which site is this about?</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              onPress={() => handleSiteChoice("")}
              activeOpacity={0.8}
              style={[styles.siteChip, !selectedSiteId && styles.siteChipActive]}
            >
              <Text style={[styles.siteChipText, !selectedSiteId && styles.siteChipTextActive]}>
                — A new site —
              </Text>
            </TouchableOpacity>
            {existingSites.map((s) => {
              const active = String(selectedSiteId) === String(s.id);
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => handleSiteChoice(s.id)}
                  activeOpacity={0.8}
                  style={[styles.siteChip, active && styles.siteChipActive]}
                >
                  <Text style={[styles.siteChipText, active && styles.siteChipTextActive]} numberOfLines={1}>
                    {s.reference} — {s.site_name || s.area || "Site"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
      )}

      {/* Contact Details */}
      <Card style={styles.card}>
        <Text style={styles.sectionLabel}>Contact details</Text>
        <Field
          label="Your name *"
          placeholder="e.g. Rahul Sharma"
          value={name}
          onChangeText={setName}
        />
        <Field
          label="Phone number *"
          placeholder="10-digit mobile"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={handlePhoneChange}
        />
        <Field
          label="Email"
          placeholder="e.g. rahul@example.com"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Property type</Text>
        <View style={styles.typeWrap}>
          {PROPERTY_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setPropertyType(t)}
              activeOpacity={0.85}
              style={[styles.typeChip, propertyType === t && styles.typeChipActive]}
            >
              <Text style={[styles.typeText, propertyType === t && styles.typeTextActive]}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* Site Details */}
      <Card style={styles.card}>
        <Text style={styles.sectionLabel}>Site details</Text>
        <Field
          label="Site / building name *"
          placeholder="e.g. Om Tower, Shivalik Residency"
          value={siteName}
          onChangeText={setSiteName}
        />
        <Field
          label="Area"
          placeholder="e.g. Adajan, Vesu, Katargam…"
          value={area}
          onChangeText={setArea}
        />
        <Field
          label="Full site address"
          placeholder="Building, street, landmark, Surat"
          value={siteAddress}
          onChangeText={setSiteAddress}
          multiline
        />

        {/* Use my current location */}
        <View style={{ marginTop: 6, marginBottom: 4 }}>
          <TouchableOpacity
            style={styles.locationBtn}
            activeOpacity={0.8}
            onPress={handleUseCurrentLocation}
          >
            <Ionicons name="location-sharp" size={17} color={theme.colors.navy} />
            <Text style={styles.locationBtnText}>Use my current location</Text>
          </TouchableOpacity>
          {locStatus ? (
            <Text style={styles.locStatusText}>{locStatus}</Text>
          ) : null}
        </View>
      </Card>

      {/* Problem / Voice note */}
      <Card style={styles.card}>
        <Text style={styles.sectionLabel}>What's the problem, if any?</Text>
        <Text style={styles.helperText}>
          Describe any current issues or requirements for your site.
        </Text>
        <TextInput
          style={styles.textArea}
          placeholder="e.g. extinguisher pressure low, alarm panel showing fault, or just due for a checkup…"
          placeholderTextColor="#94A3B8"
          value={problemDescription}
          onChangeText={setProblemDescription}
          multiline
          numberOfLines={4}
        />

        <Text style={[styles.label, { marginTop: 14 }]}>Voice Note / Audio Explanation (Optional)</Text>
        <TextInput
          style={[styles.textArea, { minHeight: 60 }]}
          placeholder="Type or record message for our technician. Our technician will review this directly."
          placeholderTextColor="#94A3B8"
          value={voiceNote}
          onChangeText={setVoiceNote}
          multiline
        />
      </Card>

      {/* Submit */}
      <Btn
        title="Send inquiry"
        onPress={handleSubmit}
        loading={submitting}
        size="lg"
        style={{ marginTop: 8 }}
      />
      <Text style={styles.footerNote}>
        Our technician will visit, inspect and share a quotation — no payment now.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: theme.colors.navy,
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 21,
  },
  signedInBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  signedInText: {
    flex: 1,
    fontSize: 13,
    color: "#1E3A8A",
    lineHeight: 18,
  },
  card: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  siteChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  siteChipActive: {
    borderColor: theme.colors.navy,
    backgroundColor: "#EFF6FF",
  },
  siteChipText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
  },
  siteChipTextActive: {
    color: theme.colors.navy,
    fontWeight: "700",
  },
  typeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  typeChipActive: {
    borderColor: theme.colors.navy,
    backgroundColor: theme.colors.navy,
  },
  typeText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
  },
  typeTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  locationBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
  },
  locationBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.navy,
  },
  locStatusText: {
    fontSize: 12,
    color: "#059669",
    fontWeight: "600",
    marginTop: 6,
  },
  textArea: {
    minHeight: 85,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    padding: 12,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
    textAlignVertical: "top",
  },
  footerNote: {
    textAlign: "center",
    fontSize: 13,
    color: "#64748B",
    marginTop: 10,
    lineHeight: 18,
  },
});
