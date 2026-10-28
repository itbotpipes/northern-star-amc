import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { theme } from "./src/theme";

// Auth
import LoginScreen from "./src/screens/LoginScreen";
// Tabs
import TodayScreen from "./src/screens/TodayScreen";
import VisitsScreen from "./src/screens/VisitsScreen";
import ScanScreen from "./src/screens/ScanScreen";
import AlertsScreen from "./src/screens/AlertsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
// Detail screens (pushed above the tabs)
import VisitDetailScreen from "./src/screens/VisitDetailScreen";
import MaterialQuotationScreen from "./src/screens/MaterialQuotationScreen";
import RefillPickupsScreen from "./src/screens/RefillPickupsScreen";
import InquiryChecklistScreen from "./src/screens/InquiryChecklistScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const navHeader = {
  headerStyle: { backgroundColor: theme.navy },
  headerTintColor: "#fff",
  headerTitleStyle: { fontWeight: "700" },
  headerBackTitleVisible: false,
};

const TAB_ICONS = {
  Today: "sunny",
  Visits: "checkmark-done",
  Alerts: "notifications",
  Me: "person",
};

function ScanTabIcon({ focused }) {
  return (
    <View
      style={{
        width: 46, height: 46, borderRadius: 14, marginBottom: 18,
        backgroundColor: theme.navy, alignItems: "center", justifyContent: "center",
        shadowColor: theme.navy, shadowOpacity: 0.3, shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 }, elevation: 4,
      }}
    >
      <Ionicons name="grid" size={22} color="#fff" />
    </View>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...navHeader,
        tabBarActiveTintColor: theme.navy,
        tabBarInactiveTintColor: theme.inkSubtle,
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: theme.hair, height: 62, paddingBottom: 8, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ color, size, focused }) =>
          route.name === "Scan" ? (
            <ScanTabIcon focused={focused} />
          ) : (
            <Ionicons name={focused ? TAB_ICONS[route.name] : `${TAB_ICONS[route.name]}-outline`} size={size} color={color} />
          ),
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} options={{ title: "Northern Star" }} />
      <Tab.Screen name="Visits" component={VisitsScreen} options={{ title: "My Visits" }} />
      <Tab.Screen name="Scan" component={ScanScreen} options={{ title: "Scan Asset", tabBarLabel: "" }} />
      <Tab.Screen name="Alerts" component={AlertsScreen} options={{ title: "Alerts" }} />
      <Tab.Screen name="Me" component={ProfileScreen} options={{ title: "My Profile" }} />
    </Tab.Navigator>
  );
}

function Routes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: theme.navy }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={navHeader}>
      {user ? (
        <>
          <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
          <Stack.Screen name="VisitDetail" component={VisitDetailScreen} options={{ title: "Visit" }} />
          <Stack.Screen name="MaterialQuotation" component={MaterialQuotationScreen} options={{ title: "Material Quotation" }} />
          <Stack.Screen name="RefillPickups" component={RefillPickupsScreen} options={{ title: "Refill Pickups" }} />
          <Stack.Screen name="InquiryChecklist" component={InquiryChecklistScreen} options={{ title: "Site Inspection" }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="light" />
        <NavigationContainer>
          <Routes />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
