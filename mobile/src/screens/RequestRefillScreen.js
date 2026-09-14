import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme } from "../theme";
import { Card, SectionTitle, Field, Btn } from "../components/ui";

const EXT_TYPES = [
  { id: "ABC Dry Powder", label: "ABC Dry Powder", desc: "Multipurpose (Wood, Paper, Liquids, Electrical)" },
  { id: "CO2 Gas", label: "CO2 Gas", desc: "Electrical Equipment & Flammable Liquids" },
  { id: "K-Class / Kitchen", label: "K-Class", desc: "Commercial Kitchens, Cooking Oils & Fats" },
  { id: "Clean Agent", label: "Clean Agent", desc: "Datacenters, IT Rooms & Sensitive Electronics" },
  { id: "Water / Foam", label: "Water / Foam", desc: "Class A Solid Combustibles" },
  { id: "Modular Automatic", label: "Modular Automatic", desc: "Ceiling Mounted Automatic Suppression" },
];

const CAPACITIES = ["2 kg", "4 kg", "6 kg", "9 kg", "4.5 kg", "50 L"];

export default function RequestRefillScreen({ navigation }) {
  const [items, setItems] = useState([
    { ext_type: "ABC Dry Powder", capacity: "6 kg", quantity: 1, notes: "" }
  ]);
  const [serviceMode, setServiceMode] = useState("onsite"); // onsite | pickup
  const [paymentMode, setPaymentMode] = useState("cash");   // cash | online
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    // Pre-fill user area & address
    api.me().then((res) => {
      if (res && res.user) {
        if (res.user.area) setArea(res.user.area);
        if (res.user.address) setAddress(res.user.address);
      }
    }).catch(() => {});
  }, []);

  const addItem = () => {
    setItems([
      ...items,
      { ext_type: "ABC Dry Powder", capacity: "6 kg", quantity: 1, notes: "" }
    ]);
  };

  const removeItem = (idx) => {
    if (items.length <= 1) {
      setErrorMsg("Please keep at least one extinguisher in your refill order.");
      return;
    }
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, key, val) => {
    const next = [...items];
    next[idx][key] = val;
    setItems(next);
  };

  const changeQty = (idx, delta) => {
    const next = [...items];
    const newQty = Math.max(1, (next[idx].quantity || 1) + delta);
    next[idx].quantity = newQty;
    setItems(next);
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!area.trim() || !address.trim()) {
      setErrorMsg("Please specify your area and delivery address.");
      return;
    }

    try {
      setSubmitting(true);
      await api.createRefillOrder({
        items,
        service_mode: serviceMode,
        payment_mode: paymentMode,
        area: area.trim(),
        address: address.trim(),
        notes: notes.trim(),
      });
      // Instantly return to My Requests screen
      navigation.goBack();
    } catch (e) {
      setErrorMsg(e.message || "Could not submit refill request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>
      {/* Error Banner */}
      {errorMsg ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={20} color={theme.danger} />
          <Text style={styles.errorBoxText}>{errorMsg}</Text>
        </View>
      ) : null}
      {/* Header banner */}
      <View style={styles.banner}>
        <Ionicons name="flame" size={28} color={theme.amber} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.bannerTitle}>Fire Extinguisher Refilling</Text>
          <Text style={styles.bannerSub}>On-demand refills with certified gas testing & pressure checks</Text>
        </View>
      </View>

      {/* Extinguishers List */}
      <SectionTitle>Extinguishers to Refill</SectionTitle>
      {items.map((item, idx) => (
        <Card key={`item-${idx}`} style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemNumber}>Unit #{idx + 1}</Text>
            {items.length > 1 ? (
              <TouchableOpacity onPress={() => removeItem(idx)} style={styles.removeBtn}>
                <Ionicons name="trash-outline" size={18} color={theme.danger} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Type selector */}
          <Text style={styles.label}>Extinguisher Type</Text>
          <View style={styles.typeGrid}>
            {EXT_TYPES.map((t) => {
              const active = item.ext_type === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => updateItem(idx, "ext_type", t.id)}
                  style={[styles.typeChip, active && styles.typeChipActive]}
                >
                  <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Capacity selector */}
          <Text style={styles.label}>Capacity / Weight</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={styles.capRow}>
              {CAPACITIES.map((c) => {
                const active = item.capacity === c;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => updateItem(idx, "capacity", c)}
                    style={[styles.capChip, active && styles.capChipActive]}
                  >
                    <Text style={[styles.capChipText, active && styles.capChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Quantity stepper */}
          <View style={styles.qtyRow}>
            <Text style={styles.label}>Quantity</Text>
            <View style={styles.stepper}>
              <TouchableOpacity onPress={() => changeQty(idx, -1)} style={styles.stepBtn}>
                <Ionicons name="remove" size={18} color={theme.navy} />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <TouchableOpacity onPress={() => changeQty(idx, 1)} style={styles.stepBtn}>
                <Ionicons name="add" size={18} color={theme.navy} />
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      ))}

      <TouchableOpacity onPress={addItem} style={styles.addBtn}>
        <Ionicons name="add-circle-outline" size={20} color={theme.navy} />
        <Text style={styles.addBtnText}>Add Another Extinguisher</Text>
      </TouchableOpacity>

      {/* Service Mode */}
      <SectionTitle style={{ marginTop: 12 }}>Service Location Mode</SectionTitle>
      <View style={styles.modeRow}>
        <TouchableOpacity
          onPress={() => setServiceMode("onsite")}
          style={[styles.modeCard, serviceMode === "onsite" && styles.modeCardActive]}
        >
          <Ionicons name="construct" size={22} color={serviceMode === "onsite" ? theme.navy : theme.inkSubtle} />
          <Text style={[styles.modeTitle, serviceMode === "onsite" && styles.modeTitleActive]}>On-site Service</Text>
          <Text style={styles.modeSub}>Refilled at your site by mobile van</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setServiceMode("pickup")}
          style={[styles.modeCard, serviceMode === "pickup" && styles.modeCardActive]}
        >
          <Ionicons name="car" size={22} color={serviceMode === "pickup" ? theme.navy : theme.inkSubtle} />
          <Text style={[styles.modeTitle, serviceMode === "pickup" && styles.modeTitleActive]}>Pickup & Return</Text>
          <Text style={styles.modeSub}>Collected & returned within 48h</Text>
        </TouchableOpacity>
      </View>

      {/* Delivery Details */}
      <SectionTitle style={{ marginTop: 12 }}>Location Details</SectionTitle>
      <Card>
        <Field label="Area / Locality" value={area} onChangeText={setArea} placeholder="e.g. Ring Road, Adajan" />
        <Field label="Complete Address" value={address} onChangeText={setAddress} placeholder="Building, Street, Landmark" multiline />
        <Field label="Special Notes / Instructions (Optional)" value={notes} onChangeText={setNotes} placeholder="e.g. Gate 2 entry, call security" multiline />
      </Card>

      {/* Payment Mode */}
      <SectionTitle style={{ marginTop: 4 }}>Payment Option</SectionTitle>
      <View style={styles.modeRow}>
        <TouchableOpacity
          onPress={() => setPaymentMode("cash")}
          style={[styles.modeCard, paymentMode === "cash" && styles.modeCardActive]}
        >
          <Ionicons name="cash-outline" size={22} color={paymentMode === "cash" ? theme.navy : theme.inkSubtle} />
          <Text style={[styles.modeTitle, paymentMode === "cash" && styles.modeTitleActive]}>Cash / Pay Later</Text>
          <Text style={styles.modeSub}>Pay after refilling completion</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setPaymentMode("online")}
          style={[styles.modeCard, paymentMode === "online" && styles.modeCardActive]}
        >
          <Ionicons name="card-outline" size={22} color={paymentMode === "online" ? theme.navy : theme.inkSubtle} />
          <Text style={[styles.modeTitle, paymentMode === "online" && styles.modeTitleActive]}>Online / UPI</Text>
          <Text style={styles.modeSub}>Pay via link / QR after estimate</Text>
        </TouchableOpacity>
      </View>

      {/* Submit Button */}
      <Btn
        title="Submit Refill Request"
        onPress={handleSubmit}
        loading={submitting}
        style={{ marginTop: 16 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  errorBoxText: { color: theme.danger, fontSize: 13, fontWeight: "600", flex: 1 },
  banner: {
    backgroundColor: theme.navy,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  bannerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  bannerSub: { color: "#b8c5e6", fontSize: 12, marginTop: 2, lineHeight: 16 },

  itemCard: { marginBottom: 12 },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  itemNumber: { fontSize: 14, fontWeight: "700", color: theme.navy },
  removeBtn: { padding: 4 },

  label: { fontSize: 13, fontWeight: "600", color: theme.inkMuted, marginBottom: 6 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  typeChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: theme.hair,
    backgroundColor: "#fff",
  },
  typeChipActive: { borderColor: theme.navy, backgroundColor: "#eef1fb" },
  typeChipText: { fontSize: 12, fontWeight: "600", color: theme.inkMuted },
  typeChipTextActive: { color: theme.navy, fontWeight: "700" },

  capRow: { flexDirection: "row", gap: 8 },
  capChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: theme.hair,
    backgroundColor: "#fff",
  },
  capChipActive: { borderColor: theme.amber, backgroundColor: "#fff8ec" },
  capChipText: { fontSize: 12, fontWeight: "600", color: theme.inkMuted },
  capChipTextActive: { color: "#9e6000", fontWeight: "700" },

  qtyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: "#f0eeea", borderRadius: 8, padding: 2 },
  stepBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },
  qtyText: { fontSize: 15, fontWeight: "700", color: theme.navy, paddingHorizontal: 12 },

  addBtn: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    gap: 8, paddingVertical: 12, borderWidth: 1.5, borderColor: theme.navy,
    borderStyle: "dashed", borderRadius: 12, backgroundColor: "#fff", marginBottom: 14,
  },
  addBtnText: { fontSize: 14, fontWeight: "700", color: theme.navy },

  modeRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  modeCard: {
    flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: theme.hair,
    borderRadius: 12, padding: 12, alignItems: "flex-start", gap: 4,
  },
  modeCardActive: { borderColor: theme.navy, backgroundColor: "#eef1fb" },
  modeTitle: { fontSize: 13, fontWeight: "700", color: theme.ink },
  modeTitleActive: { color: theme.navy },
  modeSub: { fontSize: 11, color: theme.inkSubtle, lineHeight: 15 },
});
