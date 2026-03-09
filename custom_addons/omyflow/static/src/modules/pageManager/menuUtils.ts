import { MenuItem, MenuRawRecord } from './types';

export const buildMenuTree = (records: MenuRawRecord[]): MenuItem[] => {
  const menuMap = new Map<number, MenuItem>();
  const rootMenus: MenuItem[] = [];

  records.forEach(record => {
    const parts = record.complete_name.split(' / ');
    const name = parts[parts.length - 1];
    const shortName = parts.length > 2 ? parts[parts.length - 1] : undefined;

    const level = parts.length - 1;
    let parentId: number | null = null;

    if (level > 0) {
      const parentPath = parts.slice(0, -1).join(' / ');
      const parentRecord = records.find(r => r.complete_name === parentPath);
      parentId = parentRecord?.id || null;
    }

    const menuItem: MenuItem = {
      id: record.id,
      name,
      shortName,
      parentId,
      children: [],
      level,
      completeName: record.complete_name,
      webIcon: record.web_icon,
      action: record.action,
    };

    menuMap.set(record.id, menuItem);
  });

  menuMap.forEach(menu => {
    if (menu.parentId === null) {
      rootMenus.push(menu);
    } else {
      const parent = menuMap.get(menu.parentId);
      if (parent) {
        parent.children.push(menu);
      }
    }
  });

  const sortChildren = (menus: MenuItem[]) => {
    menus.forEach(menu => {
      if (menu.children.length > 0) {
        sortChildren(menu.children);
      }
    });
  };

  sortChildren(rootMenus);

  return rootMenus;
};

export const findMenuItem = (menus: MenuItem[], id: number): MenuItem | null => {
  for (const menu of menus) {
    if (menu.id === id) return menu;
    const found = findMenuItem(menu.children, id);
    if (found) return found;
  }
  return null;
};

export const getLeafName = (completeName: string): string => {
  const parts = completeName.split(' / ');
  return parts[parts.length - 1];
};

export const parseActionRef = (actionRef: string | undefined): { type: string; id: number } | null => {
  if (!actionRef) return null;

  const match = actionRef.match(/^ir\.actions\.act_window\((\d+)\)$/);
  if (match) {
    return { type: 'ir.actions.act_window', id: parseInt(match[1], 10) };
  }

  return null;
};

export const flattenMenus = (menus: MenuItem[]): MenuItem[] => {
  const result: MenuItem[] = [];

  const flatten = (items: MenuItem[]) => {
    items.forEach(item => {
      result.push(item);
      if (item.children.length > 0) {
        flatten(item.children);
      }
    });
  };

  flatten(menus);
  return result;
};

export const getFavoriteMenus = (menus: MenuItem[], favoriteIds: number[]): MenuItem[] => {
  return flattenMenus(menus).filter(menu => favoriteIds.includes(menu.id));
};
