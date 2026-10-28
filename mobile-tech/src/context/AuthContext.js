// Holds the logged-in technician + token for the whole app. On launch it
// restores a saved token from secure storage and confirms it against /tech/me,
// so a returning user skips the login screen. Mirrors the customer app's
// AuthContext.js, swapping OTP verification for a straight /me refresh.

import React, { createContext, useContext, useEffect, useState } from "react";
import { api, saveToken, clearToken, getToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const { user } = await api.me();
          setUser(user);
        } catch {
          await clearToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  const signIn = async (token, user) => {
    await saveToken(token);
    setUser(user);
  };

  const signOut = async () => {
    await clearToken();
    setUser(null);
  };

  const refresh = async () => {
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      /* ignore — keep the existing user on a transient failure */
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
