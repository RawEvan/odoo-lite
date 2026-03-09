import React, { useState, useRef, useEffect } from 'react';
import { usePages } from './PageContext';
import { LayoutMode } from './types';
import './ThumbnailNav.css';

const LAYOUT_MODES: Record<LayoutMode, { name: string; icon: string }> = {
  single: { name: 'Single', icon: '□' },
  double: { name: 'Double', icon: '▯▯' },
  triple: { name: 'Triple', icon: '▯▯▯' },
  quad: { name: 'Quad', icon: '▯▯\n▯▯' },
  leftOneRightTwo: { name: 'Left 1 Right 2', icon: '▯│▯\n  │▯' },
  upOneDownTwo: { name: 'Up 1 Down 2', icon: '▯▯\n──\n▯▯' },
  leftMainRightStack: { name: 'Main + Stack', icon: '▯│▯\n  │▯' },
  horizontal: { name: 'Horizontal', icon: '→' },
};

const LayoutIcon: React.FC<{ mode: LayoutMode }> = ({ mode }) => {
  const info = LAYOUT_MODES[mode];
  return (
    <span className="thumbnail-nav__layout-icon" title={info.name}>
      {info.icon}
    </span>
  );
};

const LayoutMenu: React.FC<{
  currentMode: LayoutMode;
  onSelect: (mode: LayoutMode) => void;
}> = ({ currentMode, onSelect }) => {
  return (
    <div className="thumbnail-nav__layout-menu">
      {Object.entries(LAYOUT_MODES).map(([mode, info]) => (
        <button
          key={mode}
          className={`thumbnail-nav__layout-option ${currentMode === mode ? '--active' : ''}`}
          onClick={() => onSelect(mode as LayoutMode)}
        >
          <span className="thumbnail-nav__layout-option-icon">{info.icon}</span>
          <span className="thumbnail-nav__layout-option-name">{info.name}</span>
        </button>
      ))}
    </div>
  );
};

export const ThumbnailNav: React.FC = () => {
  const { state, setActivePage, closeGroup, setLayoutMode } = usePages();
  const { groups, groupOrder, activeGroupId, activePageId, layoutMode } = state;

  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setExpandedGroupId(null);
        setShowLayoutMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMainClick = (groupId: string, mainPageId: string) => {
    setActivePage(groupId, mainPageId);
    setExpandedGroupId(null);
  };

  const handleExpand = (event: React.MouseEvent, groupId: string) => {
    event.stopPropagation();
    setExpandedGroupId(expandedGroupId === groupId ? null : groupId);
  };

  const handleClose = (event: React.MouseEvent, groupId: string) => {
    event.stopPropagation();
    closeGroup(groupId);
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
    }
  };

  const handleLayoutSelect = (mode: LayoutMode) => {
    setLayoutMode(mode);
    setShowLayoutMenu(false);
  };

  const groupsInfo = groupOrder.map((groupId, index) => {
    const group = groups[groupId];
    if (!group) return null;

    return {
      id: groupId,
      number: index + 1,
      mainPage: group.mainPage,
      secondaryPages: group.secondaryPages,
    };
  }).filter(Boolean);

  return (
    <div className="thumbnail-nav" ref={navRef}>
      <div className="thumbnail-nav__main-row">
        <div className="thumbnail-nav__layout--fixed">
          <button
            className="thumbnail-nav__layout-btn"
            onClick={() => setShowLayoutMenu(!showLayoutMenu)}
            title="Layout Mode"
          >
            <LayoutIcon mode={layoutMode} />
          </button>
          {showLayoutMenu && (
            <LayoutMenu currentMode={layoutMode} onSelect={handleLayoutSelect} />
          )}
        </div>

        <div className="thumbnail-nav__groups">
          {groupsInfo.map((group) => {
            if (!group) return null;

            const isActive = activeGroupId === group.id;
            const isExpanded = expandedGroupId === group.id;

            return (
              <div key={group.id} className="thumbnail-nav__group">
                <div
                  className={`thumbnail-nav__main ${isActive ? '--active' : ''}`}
                  onClick={() => handleMainClick(group.id, group.mainPage.id)}
                >
                  <span className="thumbnail-nav__main-number">{group.number}</span>
                  <span className="thumbnail-nav__main-title">{group.mainPage.title}</span>
                  {group.secondaryPages.length > 0 && (
                    <button
                      className="thumbnail-nav__expand-icon"
                      onClick={(e) => handleExpand(e, group.id)}
                    >
                      ▼
                    </button>
                  )}
                  <button
                    className="thumbnail-nav__item-close"
                    onClick={(e) => handleClose(e, group.id)}
                  >
                    ×
                  </button>
                </div>

                {isExpanded && group.secondaryPages.length > 0 && (
                  <div className="thumbnail-nav__secondary-dropdown">
                    {group.secondaryPages.map((page, index) => {
                      const isPageActive = activePageId === page.id;
                      return (
                        <div
                          key={page.id}
                          className={`thumbnail-nav__secondary-item ${isPageActive ? '--active' : ''}`}
                          onClick={() => setActivePage(group.id, page.id)}
                        >
                          <span className="thumbnail-nav__secondary-number">
                            {group.number}.{index + 1}
                          </span>
                          <span className="thumbnail-nav__secondary-title">{page.title}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
