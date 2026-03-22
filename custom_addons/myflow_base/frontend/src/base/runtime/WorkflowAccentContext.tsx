import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { fetchUiTheme } from "./workflowService";

const STORAGE_KEY_PRIMARY = "myflow_base:accentHex";
const STORAGE_KEY_SECONDARY = "myflow_base:secondaryHex";

export const ACCENT_PRESET_HEX = [
  "#f16300",
  "#0d6efd",
  "#198754",
  "#dc3545",
  "#6f42c1",
  "#fd7e14",
  "#20c997",
  "#e83e8c",
  "#212529",
];

/** Presets biased toward muted / neutral tones for secondary text and chrome. */
export const SECONDARY_PRESET_HEX = [
  "#7b96a1",
  "#6c757d",
  "#868e96",
  "#495057",
  "#5c6bc0",
  "#78909c",
  "#8d6e63",
  "#546e7a",
  "#607d8b",
];

export function applyPrimaryAccent(hex: string): void {
  const h = hex.trim();
  if (!h.startsWith("#")) return;
  document.documentElement.style.setProperty("--primary-color", h);
}

export function applySecondaryAccent(hex: string): void {
  const h = hex.trim();
  if (!h.startsWith("#")) return;
  document.documentElement.style.setProperty("--secondary-color", h);
}

function readStoredPrimaryHex(): string | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY_PRIMARY);
    if (!v || typeof v !== "string" || !v.startsWith("#")) return null;
    if (v.length !== 7 && v.length !== 4) return null;
    return v;
  } catch {
    return null;
  }
}

function readStoredSecondaryHex(): string | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY_SECONDARY);
    if (!v || typeof v !== "string" || !v.startsWith("#")) return null;
    if (v.length !== 7 && v.length !== 4) return null;
    return v;
  } catch {
    return null;
  }
}

function writeStoredPrimaryHex(hex: string | null): void {
  try {
    if (hex == null || hex === "") window.localStorage.removeItem(STORAGE_KEY_PRIMARY);
    else window.localStorage.setItem(STORAGE_KEY_PRIMARY, hex);
  } catch {
    /* ignore */
  }
}

function writeStoredSecondaryHex(hex: string | null): void {
  try {
    if (hex == null || hex === "") window.localStorage.removeItem(STORAGE_KEY_SECONDARY);
    else window.localStorage.setItem(STORAGE_KEY_SECONDARY, hex);
  } catch {
    /* ignore */
  }
}

export interface WorkflowAccentContextValue {
  companyHex: string;
  companySecondaryHex: string;
  companyName: string;
  effectiveHex: string;
  effectiveSecondaryHex: string;
  hasUserThemeOverride: boolean;
  setAccentHex: (hex: string) => void;
  setSecondaryAccentHex: (hex: string) => void;
  resetToCompanyTheme: () => void;
}

const AccentCtx = createContext<WorkflowAccentContextValue | null>(null);

export const WorkflowAccentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companyHex, setCompanyHex] = useState("#f16300");
  const [companySecondaryHex, setCompanySecondaryHex] = useState("#7b96a1");
  const [companyName, setCompanyName] = useState("");
  const [overrideHex, setOverrideHex] = useState<string | null>(null);
  const [overrideSecondaryHex, setOverrideSecondaryHex] = useState<string | null>(null);

  useLayoutEffect(() => {
    const p = readStoredPrimaryHex();
    const s = readStoredSecondaryHex();
    if (p) {
      applyPrimaryAccent(p);
      setOverrideHex(p);
    }
    if (s) {
      applySecondaryAccent(s);
      setOverrideSecondaryHex(s);
    }
  }, []);

  useEffect(() => {
    void fetchUiTheme()
      .then((r) => {
        const ch = r.company_primary_hex || "#f16300";
        const sh = r.company_secondary_hex || "#7b96a1";
        setCompanyHex(ch);
        setCompanySecondaryHex(sh);
        setCompanyName(r.company_name || "");
        const storedP = readStoredPrimaryHex();
        const storedS = readStoredSecondaryHex();
        if (!storedP) {
          applyPrimaryAccent(ch);
          setOverrideHex(null);
        }
        if (!storedS) {
          applySecondaryAccent(sh);
          setOverrideSecondaryHex(null);
        }
      })
      .catch(() => {
        /* keep storage / CSS from layout */
      });
  }, []);

  const setAccentHex = useCallback((hex: string) => {
    const n = hex.trim();
    if (!n.startsWith("#")) return;
    writeStoredPrimaryHex(n);
    setOverrideHex(n);
    applyPrimaryAccent(n);
  }, []);

  const setSecondaryAccentHex = useCallback((hex: string) => {
    const n = hex.trim();
    if (!n.startsWith("#")) return;
    writeStoredSecondaryHex(n);
    setOverrideSecondaryHex(n);
    applySecondaryAccent(n);
  }, []);

  const resetToCompanyTheme = useCallback(() => {
    writeStoredPrimaryHex(null);
    writeStoredSecondaryHex(null);
    setOverrideHex(null);
    setOverrideSecondaryHex(null);
    applyPrimaryAccent(companyHex);
    applySecondaryAccent(companySecondaryHex);
  }, [companyHex, companySecondaryHex]);

  const effectiveHex = overrideHex ?? companyHex;
  const effectiveSecondaryHex = overrideSecondaryHex ?? companySecondaryHex;
  const hasUserThemeOverride = overrideHex !== null || overrideSecondaryHex !== null;

  const value = useMemo<WorkflowAccentContextValue>(
    () => ({
      companyHex,
      companySecondaryHex,
      companyName,
      effectiveHex,
      effectiveSecondaryHex,
      hasUserThemeOverride,
      setAccentHex,
      setSecondaryAccentHex,
      resetToCompanyTheme,
    }),
    [
      companyHex,
      companySecondaryHex,
      companyName,
      effectiveHex,
      effectiveSecondaryHex,
      hasUserThemeOverride,
      setAccentHex,
      setSecondaryAccentHex,
      resetToCompanyTheme,
    ]
  );

  return <AccentCtx.Provider value={value}>{children}</AccentCtx.Provider>;
};

export function useWorkflowAccent(): WorkflowAccentContextValue {
  const x = useContext(AccentCtx);
  if (!x) throw new Error("useWorkflowAccent must be used within WorkflowAccentProvider");
  return x;
}
