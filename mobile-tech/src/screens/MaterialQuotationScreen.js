import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, rupees } from "../theme";
import { Btn } from "../components/ui";

const GST_PERCENT = 18;

export default function MaterialQuotationScreen({ route, navigation }) {
  const { visitId, siteName } = route.params;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.searchInventory(query);
        setResults(res.items);
        setTotal(res.total);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const addItem = (item) => {
    setCart((prev) => [...prev, {
      key: `${item.id}-${Date.now()}`,
      description: item.name,
      quantity: 1,
      unit_price: item.rate || 0,
    }]);
    setQuery("");
    setResults([]);
  };

  const updateQty = (key, delta) => {
    setCart((prev) => prev.map((it) => it.key === key
      ? { ...it, quantity: Math.max(1, it.quantity + delta) }
      : it));
  };

  const removeItem = (key) => setCart((prev) => prev.filter((it) => it.key !== key));

  const subtotal = cart.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
  const gst = Math.round(subtotal * (GST_PERCENT / 100));
  const grandTotal = subtotal + gst;

  const submit = async () => {
    if (cart.length === 0) {
      Alert.alert("Add at least one item", "Search and add a material before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      await api.raiseQuotation(visitId, cart.map(({ description, quantity, unit_price }) =>
        ({ description, quantity, unit_price })));
      Alert.alert("Quotation sent", "The client has been notified for approval.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert("Could not submit", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.h1}>Material quotation</Text>
        <Text style={styles.sub}>{siteName || "This visit"}</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={theme.inkSubtle} />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${total || ""} inventory items…`}
          value={query}
          onChangeText={setQuery}
          placeholderTextColor={theme.inkSubtle}
        />
      </View>

      {results.length > 0 ? (
        <ScrollView style={styles.resultsBox} keyboardShouldPersistTaps="handled">
          {results.map((item) => (
            <TouchableOpacity key={item.id} style={styles.resultRow} onPress={() => addItem(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.resultCategory}>{item.category}</Text>
              </View>
              <Text style={styles.resultRate}>{rupees(item.rate)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <View style={styles.itemsCard}>
          {cart.length === 0 ? (
            <Text style={styles.emptyCart}>Search above and tap an item to add it.</Text>
          ) : (
            cart.map((it) => (
              <View key={it.key} style={styles.cartRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartDesc} numberOfLines={2}>{it.description}</Text>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(it.key, -1)}>
                      <Ionicons name="remove" size={14} color={theme.ink} />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{it.quantity} × {rupees(it.unit_price)}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(it.key, 1)}>
                      <Ionicons name="add" size={14} color={theme.ink} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.cartAmount}>{rupees(it.quantity * it.unit_price)}</Text>
                <TouchableOpacity onPress={() => removeItem(it.key)} style={{ marginLeft: 8 }}>
                  <Ionicons name="trash-outline" size={16} color={theme.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{rupees(subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>GST {GST_PERCENT}%</Text>
            <Text style={styles.totalValue}>{rupees(gst)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandRow]}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{rupees(grandTotal)}</Text>
          </View>
        </View>

        <Btn title={submitting ? "Submitting…" : "Submit & notify client"}
             onPress={submit} loading={submitting} disabled={cart.length === 0} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  h1: { fontSize: 22, fontWeight: "800", color: theme.ink },
  sub: { color: theme.inkSubtle, marginTop: 2 },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff",
    marginHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.hair,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.ink },
  resultsBox: {
    maxHeight: 220, backgroundColor: "#fff", marginHorizontal: 16, marginTop: 6,
    borderRadius: 12, borderWidth: 1, borderColor: theme.hair,
  },
  resultRow: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 12,
    borderBottomWidth: 1, borderBottomColor: theme.hair,
  },
  resultName: { fontSize: 13.5, fontWeight: "600", color: theme.ink },
  resultCategory: { fontSize: 11.5, color: theme.inkSubtle, marginTop: 2 },
  resultRate: { fontSize: 13, fontWeight: "700", color: theme.navy },
  itemsCard: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: theme.hair,
    padding: 4, marginTop: 10, marginBottom: 16,
  },
  emptyCart: { padding: 16, color: theme.inkSubtle, fontSize: 13.5, textAlign: "center" },
  cartRow: {
    flexDirection: "row", alignItems: "center", padding: 12,
    borderBottomWidth: 1, borderBottomColor: theme.hair,
  },
  cartDesc: { fontSize: 13.5, fontWeight: "600", color: theme.ink },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  qtyBtn: {
    width: 22, height: 22, borderRadius: 6, backgroundColor: theme.canvas,
    alignItems: "center", justifyContent: "center",
  },
  qtyText: { fontSize: 12.5, color: theme.inkSubtle },
  cartAmount: { fontSize: 14, fontWeight: "700", color: theme.ink },
  totalsCard: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: theme.hair,
    padding: 16, marginBottom: 20,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  totalLabel: { color: theme.inkSubtle, fontSize: 13.5 },
  totalValue: { color: theme.ink, fontSize: 13.5, fontWeight: "600" },
  grandRow: { marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.hair },
  grandLabel: { fontSize: 15, fontWeight: "800", color: theme.ink },
  grandValue: { fontSize: 17, fontWeight: "800", color: theme.navy },
});
