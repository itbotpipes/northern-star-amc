import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Alert, Image, TextInput,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api, API_ORIGIN } from "../api/client";
import { theme, fmtDate } from "../theme";
import { Loading, ErrorNote, Pill, Btn } from "../components/ui";

const STATUS_CYCLE = ["ok", "issue", "na"];
const STATUS_LABEL = { ok: "OK", issue: "Issue", na: "N/A" };

export default function VisitDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [visit, setVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [workDone, setWorkDone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checkingInOut, setCheckingInOut] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.visit(id);
      setVisit(res.visit);
      const items = (res.visit.checklist && res.visit.checklist.length)
        ? res.visit.checklist
        : res.visit.checklist_defaults.map((item) => ({ item, status: "ok", note: "" }));
      setChecklist(items);
      setWorkDone(res.visit.work_done || "");
      setNotes(res.visit.notes || "");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cycleStatus = (idx) => {
    setChecklist((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(it.status) + 1) % STATUS_CYCLE.length];
      return { ...it, status: next };
    }));
  };

  const saveChecklist = async () => {
    setSaving(true);
    try {
      const res = await api.saveChecklist(id, { work_done: workDone, notes, checklist });
      setVisit(res.visit);
      return true;
    } catch (e) {
      Alert.alert("Could not save", e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onCheckin = async () => {
    setCheckingInOut(true);
    try {
      const res = await api.checkin(id, null, null, null);
      setVisit(res.visit);
    } catch (e) {
      Alert.alert("Could not check in", e.message);
    } finally {
      setCheckingInOut(false);
    }
  };

  const onCheckout = async () => {
    setCheckingInOut(true);
    try {
      const res = await api.checkout(id);
      setVisit(res.visit);
    } catch (e) {
      Alert.alert("Could not check out", e.message);
    } finally {
      setCheckingInOut(false);
    }
  };

  const onAddPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera permission needed", "Enable camera access to attach site photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (result.canceled) return;
    setUploading(true);
    try {
      await api.uploadPhoto(id, result.assets[0].uri);
      load();
    } catch (e) {
      Alert.alert("Upload failed", e.message);
    } finally {
      setUploading(false);
    }
  };

  const onComplete = async () => {
    const ok = await saveChecklist();
    if (!ok) return;
    setCompleting(true);
    try {
      await api.completeVisit(id);
      Alert.alert("Visit completed", "Great work — the client has been notified.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert("Could not complete visit", e.message);
    } finally {
      setCompleting(false);
    }
  };

  const call = () => {
    if (visit.customer_phone) Linking.openURL(`tel:${visit.customer_phone}`);
  };
  const directions = () => {
    const q = encodeURIComponent(visit.site_address || visit.site_name || "");
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={() => { setLoading(true); load(); }} />;
  if (!visit) return null;

  const isDone = visit.status === "completed";

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={styles.pillRow}>
        <View style={styles.refBadge}><Text style={styles.refBadgeText}>{visit.contract_reference}</Text></View>
        <Pill label={`${visit.label} · ${isDone ? "Completed" : "In Progress"}`} status={visit.status} />
      </View>

      <Text style={styles.siteName}>{visit.site_name || visit.contract_reference}</Text>
      <Text style={styles.siteSub}>
        {visit.site_address}{visit.scheduled_time_label ? ` · ${visit.scheduled_time_label}` : ""}
      </Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionBtn, styles.callBtn]} onPress={call}>
          <Ionicons name="call" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Call site</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.dirBtn]} onPress={directions}>
          <Ionicons name="navigate-outline" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Directions</Text>
        </TouchableOpacity>
      </View>

      {!isDone ? (
        visit.checkin_at && !visit.checkout_at ? (
          <Btn title={checkingInOut ? "Checking out…" : "Check out"} variant="outline"
               onPress={onCheckout} loading={checkingInOut} style={{ marginBottom: 20 }} />
        ) : !visit.checkin_at ? (
          <Btn title={checkingInOut ? "Checking in…" : "Check in at site"} variant="primary"
               onPress={onCheckin} loading={checkingInOut} style={{ marginBottom: 20 }} />
        ) : (
          <Text style={styles.onsiteNote}>
            On site since {new Date(visit.checkin_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        )
      ) : null}

      <Text style={styles.sectionTitle}>Maintenance checklist</Text>
      <View style={styles.checklistCard}>
        {checklist.map((it, idx) => (
          <TouchableOpacity
            key={it.item}
            style={[styles.checkRow, idx < checklist.length - 1 && styles.checkRowBorder]}
            onPress={() => !isDone && cycleStatus(idx)}
            disabled={isDone}
          >
            <View style={[styles.checkBox, it.status === "ok" && styles.checkBoxOk]}>
              {it.status === "ok" ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
            </View>
            <Text style={styles.checkItem}>{it.item}</Text>
            <Pill status={it.status} label={STATUS_LABEL[it.status]} />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Work done</Text>
      <View style={styles.notesBox}>
        <TextInput
          style={styles.notesInput}
          value={workDone}
          onChangeText={setWorkDone}
          onBlur={saveChecklist}
          editable={!isDone}
          multiline
          placeholder="Describe the work carried out on this visit…"
          placeholderTextColor={theme.inkSubtle}
        />
      </View>

      <Text style={styles.sectionTitle}>Site photos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
        {(visit.photos || []).map((p) => (
          <Image key={p.id} source={{ uri: `${API_ORIGIN}${p.url}` }} style={styles.photo} />
        ))}
        {!isDone ? (
          <TouchableOpacity style={styles.addPhoto} onPress={onAddPhoto} disabled={uploading}>
            <Ionicons name="add" size={22} color={theme.inkSubtle} />
            <Text style={styles.addPhotoText}>{uploading ? "Uploading…" : "Add"}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {!isDone ? (
        <TouchableOpacity style={styles.quoteCard}
          onPress={() => navigation.navigate("MaterialQuotation", { visitId: id, siteName: visit.site_name })}>
          <View style={styles.quoteIcon}><Ionicons name="bookmark" size={16} color={theme.amberDark} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.quoteTitle}>Raise material quotation</Text>
            <Text style={styles.quoteSub}>Search inventory · notify client</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.inkSubtle} />
        </TouchableOpacity>
      ) : null}

      {(visit.material_quotes || []).length > 0 ? (
        <View style={{ marginBottom: 20 }}>
          {visit.material_quotes.map((q) => (
            <View key={q.id} style={styles.quoteRow}>
              <Text style={styles.quoteRef}>{q.reference}</Text>
              <Pill status={q.status} />
            </View>
          ))}
        </View>
      ) : null}

      {!isDone ? (
        <Btn title={completing ? "Completing…" : "Mark visit complete"} variant="primary"
             onPress={onComplete} loading={completing || saving} />
      ) : (
        <View style={styles.doneBanner}>
          <Ionicons name="checkmark-circle" size={20} color={theme.success} />
          <Text style={styles.doneBannerText}>Visit completed on {fmtDate(visit.completed_date)}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.canvas },
  pillRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 10 },
  refBadge: { backgroundColor: theme.navy, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  refBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  siteName: { fontSize: 22, fontWeight: "800", color: theme.ink },
  siteSub: { fontSize: 13.5, color: theme.inkSubtle, marginTop: 4, marginBottom: 16 },
  actionsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: 10,
  },
  callBtn: { backgroundColor: theme.success },
  dirBtn: { backgroundColor: theme.navyDark },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  onsiteNote: { color: theme.inkMuted, fontSize: 13, fontWeight: "600", marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: theme.ink, marginBottom: 10, marginTop: 4 },
  checklistCard: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: theme.hair, marginBottom: 20,
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  checkRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.hair },
  checkBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.hair,
    alignItems: "center", justifyContent: "center",
  },
  checkBoxOk: { backgroundColor: theme.success, borderColor: theme.success },
  checkItem: { flex: 1, fontSize: 14.5, color: theme.ink, fontWeight: "600" },
  notesBox: {
    backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: theme.hair,
    padding: 14, marginBottom: 20,
  },
  notesInput: { fontSize: 14, color: theme.ink, lineHeight: 20, minHeight: 70, textAlignVertical: "top" },
  photo: { width: 72, height: 72, borderRadius: 10, marginRight: 10, backgroundColor: theme.hair },
  addPhoto: {
    width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderStyle: "dashed",
    borderColor: theme.hair, alignItems: "center", justifyContent: "center",
  },
  addPhotoText: { fontSize: 11, color: theme.inkSubtle, marginTop: 2 },
  quoteCard: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff",
    borderRadius: 14, borderWidth: 1, borderColor: theme.hair, padding: 14, marginBottom: 16,
  },
  quoteIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: theme.amberLight,
    alignItems: "center", justifyContent: "center",
  },
  quoteTitle: { fontSize: 14.5, fontWeight: "700", color: theme.ink },
  quoteSub: { fontSize: 12.5, color: theme.inkSubtle, marginTop: 1 },
  quoteRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: theme.hair,
    padding: 12, marginBottom: 8,
  },
  quoteRef: { fontWeight: "700", color: theme.ink },
  doneBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.successLight,
    borderRadius: 12, padding: 14,
  },
  doneBannerText: { color: theme.success, fontWeight: "700", fontSize: 13.5 },
});
