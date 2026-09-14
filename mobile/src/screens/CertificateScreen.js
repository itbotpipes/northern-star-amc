import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity, Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api, API_BASE } from "../api/client";
import { theme, fmtDate } from "../theme";
import { Card, Pill, Btn, Loading, ErrorNote, SectionTitle } from "../components/ui";

export default function CertificateScreen({ route, navigation }) {
  const { id, contract: initialContract } = route.params || {};
  const contractId = id || initialContract?.id;
  const [data, setData] = useState(initialContract ? {
    contract_id: initialContract.id,
    contract_ref: initialContract.reference,
    site_name: initialContract.site_name,
    certificate_no: `NSE-CERT-${initialContract.id.toString().padStart(4, "0")}`,
    certificate_issued: Boolean(initialContract.certificate_issued),
    certificate_issued_at: initialContract.certificate_issued_at,
    plan_name: initialContract.plan,
    client_address: initialContract.site_address,
    completed_visits: initialContract.completed_visits,
    total_visits: initialContract.total_visits,
    standards: ["NBC (National Building Code)", "BIS Compliance", "IS Fire Safety Standards", "NFPA Guidelines"],
  } : null);
  const [loading, setLoading] = useState(!initialContract);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!contractId) {
      setError("No contract ID provided.");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const certData = await api.certificate(contractId);
      setData(certData);
    } catch (e) {
      if (!data) setError(e.message || "Could not load certificate details.");
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDownload = () => {
    if (!data) return;
    const url = `${API_BASE.replace("/api/v1", "")}/portal/contract/${data.contract_id}/certificate`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Open Certificate", `Copy this link to download: ${url}`);
    });
  };

  if (loading) return <Loading text="Loading certificate details..." />;
  if (error) return <ErrorNote message={error} onRetry={() => setLoading(true)} />;

  const issued = data.certificate_issued;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>
      {/* Certificate Frame Card */}
      <View style={styles.certFrame}>
        {/* Certificate Header Banner */}
        <View style={styles.certHeader}>
          <Ionicons name="ribbon" size={40} color={theme.amber} />
          <Text style={styles.companyName}>NORTHERN STAR FIRE SAFETY</Text>
          <Text style={styles.certTitle}>AMC FIRE SAFETY CERTIFICATE</Text>
          <View style={styles.certNumberBadge}>
            <Text style={styles.certNumberText}>{data.certificate_no}</Text>
          </View>
        </View>

        {/* Certificate Body Content */}
        <View style={styles.certBody}>
          <Text style={styles.certPreamble}>This is to certify that the fire safety & suppression systems at</Text>
          
          <Text style={styles.clientSite}>{data.site_name || data.client_name}</Text>
          <Text style={styles.clientAddr}>{data.client_address}</Text>

          <View style={styles.divider} />

          <Text style={styles.certPreamble}>have been inspected, tested, and maintained under annual contract</Text>
          <Text style={styles.contractRef}>{data.contract_ref} · {data.plan_name}</Text>

          {/* Compliance Standards Badges */}
          <SectionTitle style={{ marginTop: 18, marginBottom: 8, textAlign: "center" }}>
            Standards & Regulations Complied
          </SectionTitle>
          <View style={styles.standardsGrid}>
            {(data.standards || []).map((std, idx) => (
              <View key={idx} style={styles.stdBadge}>
                <Ionicons name="checkmark-circle" size={14} color={theme.success} />
                <Text style={styles.stdText}>{std}</Text>
              </View>
            ))}
          </View>

          {/* Status Badge */}
          <View style={styles.statusBox}>
            {issued ? (
              <>
                <Ionicons name="shield-checkmark" size={32} color={theme.success} />
                <Text style={styles.statusTitle}>OFFICIALLY ISSUED & VERIFIED</Text>
                <Text style={styles.statusSub}>Issued on {fmtDate(data.certificate_issued_at)}</Text>
              </>
            ) : (
              <>
                <Ionicons name="time-outline" size={32} color={theme.amber} />
                <Text style={[styles.statusTitle, { color: "#9e6000" }]}>CERTIFICATE IN PROGRESS</Text>
                <Text style={styles.statusSub}>
                  Completed {data.completed_visits || 0} of {data.total_visits || 4} Quarterly Visits
                </Text>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(100, ((data.completed_visits || 0) / (data.total_visits || 4)) * 100)}%` },
                    ]}
                  />
                </View>
              </>
            )}
          </View>
        </View>

        {/* Certificate Seal Footer */}
        <View style={styles.certFooter}>
          <View style={styles.sealBox}>
            <Ionicons name="ribbon-outline" size={24} color="#8b93c4" />
            <Text style={styles.sealText}>Official Seal</Text>
          </View>
          <View style={styles.sealBox}>
            <Ionicons name="shield-outline" size={24} color="#8b93c4" />
            <Text style={styles.sealText}>NSE Verified</Text>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      {issued ? (
        <Btn
          title="Download PDF Certificate"
          onPress={handleDownload}
          variant="primary"
          style={{ marginTop: 18 }}
        />
      ) : (
        <Card style={{ marginTop: 16, backgroundColor: theme.warningLight, borderColor: theme.warning }}>
          <Text style={{ fontSize: 13, color: theme.ink, lineHeight: 18, textAlign: "center" }}>
            This Fire Safety Certificate unlocks automatically once all 4 quarterly service visits are completed by our engineering team.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  certFrame: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.navy,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  certHeader: {
    backgroundColor: theme.navy,
    padding: 20,
    alignItems: "center",
  },
  companyName: { color: theme.amber, fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginTop: 6 },
  certTitle: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.5, marginTop: 4 },
  certNumberBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 10,
  },
  certNumberText: { color: "#fff", fontSize: 13, fontWeight: "700", fontFamily: "monospace" },

  certBody: { padding: 20, alignItems: "center" },
  certPreamble: { fontSize: 12, color: theme.inkSubtle, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 },
  clientSite: { fontSize: 18, fontWeight: "800", color: theme.navy, textAlign: "center", marginTop: 8 },
  clientAddr: { fontSize: 13, color: theme.inkMuted, textAlign: "center", marginTop: 4, lineHeight: 18 },

  divider: { height: 1, backgroundColor: theme.hair, width: "100%", marginVertical: 14 },

  contractRef: { fontSize: 14, fontWeight: "700", color: theme.ink, textAlign: "center", marginTop: 4 },

  standardsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, width: "100%" },
  stdBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#f0f4fd", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  stdText: { fontSize: 11, fontWeight: "600", color: theme.navy },

  statusBox: {
    width: "100%",
    backgroundColor: "#f9f8f6",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 18,
    borderWidth: 1,
    borderColor: theme.hair,
  },
  statusTitle: { fontSize: 14, fontWeight: "800", color: theme.success, marginTop: 6, letterSpacing: 0.5 },
  statusSub: { fontSize: 12, color: theme.inkMuted, marginTop: 2, textAlign: "center" },

  progressBar: { height: 8, backgroundColor: "#e0dcd5", borderRadius: 4, width: "80%", marginTop: 10, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: theme.amber, borderRadius: 4 },

  certFooter: {
    flexDirection: "row", justifyContent: "space-around",
    backgroundColor: "#f0f2fa", paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.hair,
  },
  sealBox: { alignItems: "center" },
  sealText: { fontSize: 10, color: theme.inkSubtle, fontWeight: "600", marginTop: 2 },
});
