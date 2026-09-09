// Holds the logged-in user + token for the whole app. On launch it restores a
// saved token from secure storage and confirms it against /me, so a returning
// user skips the login screen.

import React, { createContext, useContext, useEffect, useState } from "react";
import { api, saveToken, clearToken, getToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true while restoring session

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const { user } = await api.me();
          setUser(user);
        } catch {
          await clearToken(); // token expired / invalid — force fresh login
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

  // Re-fetch the current user (e.g. after a profile edit) so context stays fresh.
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
