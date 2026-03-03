import React, { useState, useEffect, useCallback } from 'react';
import { MenuItem, AppPreferences } from './types';
import { buildMenuTree, getLeafName } from './menuUtils';
import { usePages } from './PageContext';
import { hasModelPage, getModelPageConfig } from '../modelPages';
import { OdooService } from '../../services/odoo';
import './SidebarMenu.css';

interface SidebarMenuProps {
  preferences: AppPreferences;
  onOpenSettings: () => void;
  onPreferencesChange: (prefs: AppPreferences) => void;
}

export const SidebarMenu: React.FC<SidebarMenuProps> = ({
  preferences,
  onOpenSettings,
  onPreferencesChange,
}) => {
  const { openPage } = usePages();
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMenus = async () => {
      try {
        const odoo = OdooService.getInstance();
        const records = await odoo.loadMenus();
        const tree = buildMenuTree(records);
        setMenus(tree);
      } catch (error) {
        console.error('Failed to load menus:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMenus();
  }, []);

  const handleMenuClick = useCallback(async (item: MenuItem) => {
    if (item.children.length > 0) {
      setExpandedIds(prev => {
        const next = new Set(prev);
        if (next.has(item.id)) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
        return next;
      });
      return;
    }

    if (!item.action) return;

    try {
      const odoo = OdooService.getInstance();
      const action = await odoo.loadAction(item.action!);

      if (action?.type === 'ir.actions.act_window' && action.res_model) {
        const model = action.res_model;

        if (hasModelPage(model)) {
          const config = getModelPageConfig(model);
          const viewMode = config?.defaultView || 'list';
          const leafName = getLeafName(item.completeName);
          openPage(`/${model}/${viewMode}`, leafName, viewMode, null, null);
          return;
        }
      }

      console.warn('No custom page for action:', item.action);
    } catch (error) {
      console.error('Failed to handle menu click:', error);
    }
  }, [openPage]);

  const handleToggleFavorite = (e: React.MouseEvent, menuId: number) => {
    e.stopPropagation();
    const newFavorites = preferences.favoriteMenus.includes(menuId)
      ? preferences.favoriteMenus.filter(id => id !== menuId)
      : [...preferences.favoriteMenus, menuId];
    onPreferencesChange({ ...preferences, favoriteMenus: newFavorites });
  };

  const renderMenuItem = (item: MenuItem, depth: number = 0) => {
    const isExpanded = expandedIds.has(item.id);
    const isFavorite = preferences.favoriteMenus.includes(item.id);
    const hasChildren = item.children.length > 0;

    return (
      <div key={item.id} className="sidebar-menu__item-wrapper">
        <div
          className={`sidebar-menu__item ${hasChildren ? '--has-children' : ''} ${isExpanded ? '--expanded' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => handleMenuClick(item)}
        >
          {hasChildren && (
            <span className={`sidebar-menu__expand-icon ${isExpanded ? '--expanded' : ''}`}>
              ▶
            </span>
          )}
          {item.webIcon ? (
            <span className="sidebar-menu__icon">{item.webIcon}</span>
          ) : (
            <span className="sidebar-menu__icon --default">📄</span>
          )}
          <span className="sidebar-menu__name">
            {item.shortName || item.name}
          </span>
          <button
            className={`sidebar-menu__favorite ${isFavorite ? '--active' : ''}`}
            onClick={(e) => handleToggleFavorite(e, item.id)}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFavorite ? '★' : '☆'}
          </button>
        </div>
        {isExpanded && hasChildren && (
          <div className="sidebar-menu__children">
            {item.children.map(child => renderMenuItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const favoriteMenus = menus.length > 0
    ? preferences.favoriteMenus
        .map(id => {
          const findMenu = (items: MenuItem[]): MenuItem | null => {
            for (const item of items) {
              if (item.id === id) return item;
              const found = findMenu(item.children);
              if (found) return found;
            }
            return null;
          };
          return findMenu(menus);
        })
        .filter(Boolean) as MenuItem[]
    : [];

  return (
    <div className="sidebar-menu">
      <div className="sidebar-menu__header">
        <h2 className="sidebar-menu__title">Menu</h2>
        <button className="sidebar-menu__settings-btn" onClick={onOpenSettings} title="Settings">
          ⚙
        </button>
      </div>

      {favoriteMenus.length > 0 && (
        <div className="sidebar-menu__favorites">
          <div className="sidebar-menu__section-title">Favorites</div>
          {favoriteMenus.map(item => (
            <div
              key={item.id}
              className="sidebar-menu__item --favorite"
              onClick={() => handleMenuClick(item)}
            >
              <span className="sidebar-menu__icon">{item.webIcon || '📄'}</span>
              <span className="sidebar-menu__name">{item.shortName || item.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sidebar-menu__content">
        {loading ? (
          <div className="sidebar-menu__loading">Loading menus...</div>
        ) : (
          menus.map(item => renderMenuItem(item))
        )}
      </div>
    </div>
  );
};
