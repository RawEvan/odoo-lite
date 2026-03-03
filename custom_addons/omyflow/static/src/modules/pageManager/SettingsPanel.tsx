import React, { useState, useEffect } from 'react';
import { AppPreferences } from './types';
import { PreferenceSettings } from './PreferenceSettings';
import './SettingsPanel.css';

type SettingsView = 'main' | 'favorites' | 'preferences';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: AppPreferences;
  onSavePreferences: (prefs: AppPreferences) => void;
  onOpenFavoriteEditor: () => void;
}

const SETTINGS_MENU = [
  { id: 'favorites', icon: '★', label: 'Favorites', description: 'Manage your favorite menus' },
  { id: 'preferences', icon: '⚙', label: 'Preferences', description: 'Default layout mode and theme colors' },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  preferences,
  onSavePreferences,
  onOpenFavoriteEditor,
}) => {
  const [currentView, setCurrentView] = useState<SettingsView>('main');

  useEffect(() => {
    if (isOpen) {
      setCurrentView('main');
    }
  }, [isOpen]);

  const handleMenuClick = (id: string) => {
    if (id === 'favorites') {
      onClose();
      onOpenFavoriteEditor();
    } else {
      setCurrentView(id as SettingsView);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getViewTitle = () => {
    switch (currentView) {
      case 'preferences':
        return 'Preferences';
      default:
        return 'Settings';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-panel__overlay" onClick={handleOverlayClick}>
      <div className="settings-panel">
        <div className="settings-panel__header">
          {currentView !== 'main' && (
            <button
              className="settings-panel__back"
              onClick={() => setCurrentView('main')}
            >
              ‹
            </button>
          )}
          <h3>{getViewTitle()}</h3>
          <button className="settings-panel__close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-panel__content">
          {currentView === 'main' && (
            <div className="settings-panel__menu">
              {SETTINGS_MENU.map(item => (
                <button
                  key={item.id}
                  className="settings-panel__menu-item"
                  onClick={() => handleMenuClick(item.id)}
                >
                  <span className="settings-panel__menu-icon">{item.icon}</span>
                  <div className="settings-panel__menu-info">
                    <span className="settings-panel__menu-label">{item.label}</span>
                    <span className="settings-panel__menu-desc">{item.description}</span>
                  </div>
                  <span className="settings-panel__menu-arrow">›</span>
                </button>
              ))}
            </div>
          )}

          {currentView === 'preferences' && (
            <PreferenceSettings
              preferences={preferences}
              onSave={onSavePreferences}
            />
          )}
        </div>
      </div>
    </div>
  );
};
