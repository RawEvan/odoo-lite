import { ThemeColor, THEME_COLORS } from '../modules/pageManager/PreferenceSettings';

const PREFERENCES_KEY = 'omyflow_preferences';

export function applyThemeColors(primaryColor: ThemeColor, secondaryColor: ThemeColor): void {
  const root = document.documentElement;
  const primary = THEME_COLORS[primaryColor];
  const secondary = THEME_COLORS[secondaryColor];

  root.style.setProperty('--primary-color', primary.primary);
  root.style.setProperty('--primary-hover', primary.hover);
  root.style.setProperty('--primary-light', primary.light);

  root.style.setProperty('--secondary-color', secondary.primary);
  root.style.setProperty('--secondary-hover', secondary.hover);
  root.style.setProperty('--secondary-light', secondary.light);
}

export function initThemeColors(): void {
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.primaryColor && parsed.secondaryColor) {
        applyThemeColors(parsed.primaryColor, parsed.secondaryColor);
      }
    }
  } catch (e) {
    console.warn('Failed to parse preferences for theme:', e);
  }
}

export function getDefaultPreferences() {
  return {
    defaultLayoutMode: 'single' as const,
    primaryColor: 'odoo' as ThemeColor,
    secondaryColor: 'slate' as ThemeColor,
    favoriteMenus: [] as number[],
  };
}

export function loadPreferences() {
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (stored) {
      return { ...getDefaultPreferences(), ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load preferences:', e);
  }
  return getDefaultPreferences();
}

export function savePreferences(preferences: ReturnType<typeof getDefaultPreferences>): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (e) {
    console.warn('Failed to save preferences:', e);
  }
}
