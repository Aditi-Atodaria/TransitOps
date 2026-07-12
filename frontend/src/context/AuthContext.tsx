import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { login as loginApi, fetchCurrentUser, CurrentUser } from "@/api/auth";
import { clearToken } from "@/api/client";

interface AuthContextType {
  isAuthenticated: boolean;
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: if a token exists from a previous session, fetch the real
  // user record instead of trusting a stale boolean.
  useEffect(() => {
    if (!localStorage.getItem("token")) {
      setLoading(false);
      return;
    }
    fetchCurrentUser()
      .then(setUser)
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await loginApi(email, password);
    setUser(data.user);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ isAuthenticated: !!user, user, loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
