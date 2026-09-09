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
import VerifyScreen from "./src/screens/VerifyScreen";
// Tabs
import HomeScreen from "./src/screens/HomeScreen";
import QuotationsScreen from "./src/screens/QuotationsScreen";
import NotificationsScreen from "./src/screens/NotificationsScreen";
import TicketsScreen from "./src/screens/TicketsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
// Detail screens (pushed above the tabs)
import ContractScreen from "./src/screens/ContractScreen";
import VisitScreen from "./src/screens/VisitScreen";
import QuotationDetailScreen from "./src/screens/QuotationDetailScreen";
import MaterialQuoteScreen from "./src/screens/MaterialQuoteScreen";
import RequestsScreen from "./src/screens/RequestsScreen";
import RaiseTicketScreen from "./src/screens/RaiseTicketScreen";
import TicketDetailScreen from "./src/screens/TicketDetailScreen";
import JourneyScreen from "./src/screens/JourneyScreen";
import AgreementScreen from "./src/screens/AgreementScreen";
import ReferScreen from "./src/screens/ReferScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const navHeader = {
  headerStyle: { backgroundColor: theme.navy },
  headerTintColor: "#fff",
  headerTitleStyle: { fontWeight: "700" },
  headerBackTitleVisible: false,
};

const TAB_ICONS = {
  Home: "home",
  Quotes: "pricetags",
  Alerts: "notifications",
  Help: "chatbox-ellipses",
  Profile: "person",
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...navHeader,
        tabBarActiveTintColor: theme.navy,
        tabBarInactiveTintColor: theme.inkSubtle,
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: theme.hair, height: 58, paddingBottom: 6, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={focused ? TAB_ICONS[route.name] : `${TAB_ICONS[route.name]}-outline`} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Northern Star" }} />
      <Tab.Screen name="Quotes" component={QuotationsScreen} options={{ title: "Quotations" }} />
      <Tab.Screen name="Alerts" component={NotificationsScreen} options={{ title: "Notifications" }} />
      <Tab.Screen name="Help" component={TicketsScreen} options={{ title: "Complaints" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "My Profile" }} />
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
          <Stack.Screen name="Contract" component={ContractScreen} options={{ title: "Contract" }} />
          <Stack.Screen name="Visit" component={VisitScreen} options={{ title: "Service Visit" }} />
          <Stack.Screen name="QuotationDetail" component={QuotationDetailScreen} options={{ title: "Quotation" }} />
          <Stack.Screen name="MaterialQuote" component={MaterialQuoteScreen} options={{ title: "Material Quote" }} />
          <Stack.Screen name="Requests" component={RequestsScreen} options={{ title: "My Requests" }} />
          <Stack.Screen name="RaiseTicket" component={RaiseTicketScreen} options={{ title: "New Complaint" }} />
          <Stack.Screen name="TicketDetail" component={TicketDetailScreen} options={{ title: "Complaint" }} />
          <Stack.Screen name="Journey" component={JourneyScreen} options={{ title: "My Journey" }} />
          <Stack.Screen name="Agreement" component={AgreementScreen} options={{ title: "AMC Agreement" }} />
          <Stack.Screen name="Refer" component={ReferScreen} options={{ title: "Refer a Friend" }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Verify" component={VerifyScreen} options={{ title: "Verify OTP" }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <NavigationContainer>
          <Routes />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
