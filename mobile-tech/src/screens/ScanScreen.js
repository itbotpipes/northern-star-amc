import React, { useState, useRef, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { theme, fmtDate } from "../theme";
import { Pill, Btn } from "../components/ui";

// Session-local scan history (device-side convenience, not a server record —
// there's no backend concept of "who scanned what and when" to persist against).
export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const lockRef = useRef(false);

  useFocusEffect(useCallback(() => {
    setScanning(true);
    lockRef.current = false;
  }, []));

  const onScan = async ({ data }) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setScanning(false);
    setError(null);
    try {
      const res = await api.lookupEquipment(data);
      setHistory((prev) => [res.equipment, ...prev].slice(0, 10));
    } catch (e) {
      setError(e.message || "No equipment found for that code.");
    }
    setTimeout(() => { lockRef.current = false; setScanning(true); }, 1500);
  };

  if (!permission) return <View style={styles.wrap} />;

  if (!permission.granted) {
    return (
      <View style={[styles.wrap, styles.permCenter]}>
        <Ionicons name="camera-outline" size={40} color={theme.inkSubtle} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permSub}>To scan the QR tag on fire-safety equipment.</Text>
        <Btn title="Grant camera access" onPress={requestPermission} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.cameraBox}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanning ? onScan : undefined}
        />
        <View style={styles.frame} pointerEvents="none" />
        <Text style={styles.hint}>Point at the QR tag on any asset</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionTitle}>Last scanned</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <ScrollView>
          {history.length === 0 && !error ? (
            <Text style={styles.muted}>Scan an equipment QR tag to see its details here.</Text>
          ) : (
            history.map((e, i) => (
              <View key={`${e.id}-${i}`} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
                  <Pill status={e.refill_status === "ok" ? "ok" : e.refill_status === "overdue" ? "overdue" : "issue"}
                       label={e.refill_status === "ok" ? "OK" : e.refill_status === "overdue" ? "Overdue" : "Due soon"} />
                </View>
                <Text style={styles.sub}>
                  {e.serial_no || "—"} · {e.location || e.site_name || "—"}
                </Text>
                <View style={styles.metaRow}>
                  <View>
                    <Text style={styles.metaLabel}>LAST REFILL</Text>
                    <Text style={styles.metaValue}>{fmtDate(e.last_refill_date)}</Text>
                  </View>
                  <View>
                    <Text style={styles.metaLabel}>NEXT DUE</Text>
                    <Text style={styles.metaValue}>{fmtDate(e.next_refill_date)}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  permCenter: { alignItems: "center", justifyContent: "center", padding: 30 },
  permTitle: { fontSize: 16, fontWeight: "700", color: theme.ink, marginTop: 10 },
  permSub: { fontSize: 13, color: theme.inkSubtle, textAlign: "center", marginTop: 4 },
  cameraBox: { height: 320, backgroundColor: theme.navyDark, overflow: "hidden" },
  frame: {
    position: "absolute", top: "22%", left: "18%", right: "18%", bottom: "30%",
    borderWidth: 2, borderColor: theme.amber, borderRadius: 16,
  },
  hint: {
    position: "absolute", bottom: 16, alignSelf: "center", color: "#dfe3f5",
    fontSize: 13, fontWeight: "600",
  },
  body: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: theme.ink, marginBottom: 10 },
  errorText: { color: theme.danger, fontSize: 13, marginBottom: 10 },
  muted: { color: theme.inkSubtle, fontSize: 14 },
  card: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: theme.hair,
    padding: 14, marginBottom: 10,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: "700", color: theme.ink },
  sub: { fontSize: 12.5, color: theme.inkSubtle, marginTop: 4, fontFamily: "monospace" },
  metaRow: { flexDirection: "row", gap: 24, marginTop: 10 },
  metaLabel: { fontSize: 10, color: theme.inkSubtle, letterSpacing: 0.4, fontWeight: "700" },
  metaValue: { fontSize: 13, color: theme.ink, fontWeight: "700", marginTop: 2 },
});
