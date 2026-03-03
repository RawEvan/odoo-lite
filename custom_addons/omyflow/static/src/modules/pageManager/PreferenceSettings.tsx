import React, { useState } from 'react';
import { AppPreferences, ThemeColor, ThemeColorInfo, LayoutMode } from './types';
import { applyThemeColors } from '../../utils/theme';
import './PreferenceSettings.css';

export const THEME_COLORS: Record<ThemeColor, ThemeColorInfo> = {
  odoo: { primary: '#714B67', hover: '#5a3d52', light: '#f5f0f4', name: 'Odoo Purple' },
  enterprise: { primary: '#0066CC', hover: '#0052A3', light: '#E6F2FF', name: 'Enterprise Blue' },
  navy: { primary: '#1E3A5F', hover: '#162B47', light: '#E8EDF3', name: 'Navy' },
  teal: { primary: '#008080', hover: '#006666', light: '#E6F2F2', name: 'Teal' },
  forest: { primary: '#2E7D32', hover: '#236B27', light: '#E8F5E9', name: 'Forest Green' },
  slate: { primary: '#475569', hover: '#3B4756', light: '#F1F5F9', name: 'Slate Gray' },
  indigo: { primary: '#4338CA', hover: '#362FC1', light: '#EEF2FF', name: 'Indigo' },
  copper: { primary: '#B87333', hover: '#966029', light: '#FDF4ED', name: 'Copper' },
};

export const LAYOUT_MODES: Record<LayoutMode, { name: string; description: string }> = {
  single: { name: 'Single', description: 'Single page view' },
  double: { name: 'Double', description: 'Two pages side by side' },
  triple: { name: 'Triple', description: 'Three pages side by side' },
  quad: { name: 'Quad', description: 'Four pages in a grid' },
  leftOneRightTwo: { name: 'Left 1 Right 2', description: 'One large left, two stacked right' },
  upOneDownTwo: { name: 'Up 1 Down 2', description: 'One wide top, two below' },
  leftMainRightStack: { name: 'Main + Stack', description: 'Main left, stacked right' },
  horizontal: { name: 'Horizontal', description: 'Horizontal scrolling pages' },
};

interface PreferenceSettingsProps {
  preferences: AppPreferences;
  onSave: (prefs: AppPreferences) => void;
}

export const PreferenceSettings: React.FC<PreferenceSettingsProps> = ({
  preferences,
  onSave,
}) => {
  const [localPreferences, setLocalPreferences] = useState<AppPreferences>(preferences);

  const handleChange = <K extends keyof AppPreferences>(
    key: K,
    value: AppPreferences[K]
  ) => {
    const newPreferences = { ...localPreferences, [key]: value };
    setLocalPreferences(newPreferences);
    onSave(newPreferences);

    if (key === 'primaryColor' || key === 'secondaryColor') {
      applyThemeColors(
        newPreferences.primaryColor,
        newPreferences.secondaryColor
      );
    }
  };

  return (
    <div className="preference-settings">
      <div className="preference-settings__item">
        <label className="preference-settings__label">Default Layout Mode</label>
        <div className="preference-settings__layout-grid">
          {Object.entries(LAYOUT_MODES).map(([mode, info]) => (
            <button
              key={mode}
              className={`preference-settings__layout-btn ${
                localPreferences.defaultLayoutMode === mode ? '--active' : ''
              }`}
              onClick={() => handleChange('defaultLayoutMode', mode as LayoutMode)}
            >
              {info.name}
            </button>
          ))}
        </div>
      </div>

      <div className="preference-settings__item">
        <label className="preference-settings__label">
          Primary Color
          <span
            className="preference-settings__current-color"
            style={{
              backgroundColor: THEME_COLORS[localPreferences.primaryColor].primary,
            }}
          />
        </label>
        <div className="preference-settings__color-options">
          {Object.entries(THEME_COLORS).map(([color, info]) => (
            <button
              key={color}
              className={`preference-settings__color-btn ${
                localPreferences.primaryColor === color ? '--active' : ''
              }`}
              style={{ backgroundColor: info.primary }}
              onClick={() => handleChange('primaryColor', color as ThemeColor)}
              title={info.name}
            />
          ))}
        </div>
      </div>

      <div className="preference-settings__item">
        <label className="preference-settings__label">
          Secondary Color
          <span
            className="preference-settings__current-color"
            style={{
              backgroundColor: THEME_COLORS[localPreferences.secondaryColor].primary,
            }}
          />
        </label>
        <div className="preference-settings__color-options">
          {Object.entries(THEME_COLORS).map(([color, info]) => (
            <button
              key={color}
              className={`preference-settings__color-btn ${
                localPreferences.secondaryColor === color ? '--active' : ''
              }`}
              style={{ backgroundColor: info.primary }}
              onClick={() => handleChange('secondaryColor', color as ThemeColor)}
              title={info.name}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
