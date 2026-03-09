import React, { useState, useEffect } from 'react';
import { PageProvider } from './modules/pageManager/PageContext';
import { PageContainer } from './modules/pageManager/PageContainer';
import { ThumbnailNav } from './modules/pageManager/ThumbnailNav';
import { SidebarMenu } from './modules/pageManager/SidebarMenu';
import { SettingsPanel } from './modules/pageManager/SettingsPanel';
import { AppPreferences } from './modules/pageManager/types';
import { initThemeColors, loadPreferences, savePreferences } from './utils/theme';

const AppContent: React.FC = () => {
  const [preferences, setPreferences] = useState<AppPreferences>(loadPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    initThemeColors();
  }, []);

  const handlePreferencesChange = (prefs: AppPreferences) => {
    setPreferences(prefs);
    savePreferences(prefs);
  };

  return (
    <div className="omyflow-app">
      <div className="omyflow-app__main">
        <SidebarMenu
          preferences={preferences}
          onOpenSettings={() => setSettingsOpen(true)}
          onPreferencesChange={handlePreferencesChange}
        />
        <div className="omyflow-app__content">
          <ThumbnailNav />
          <PageContainer />
        </div>
      </div>
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        preferences={preferences}
        onSavePreferences={handlePreferencesChange}
        onOpenFavoriteEditor={() => {
          setSettingsOpen(false);
        }}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <PageProvider>
      <AppContent />
    </PageProvider>
  );
};

export default App;
