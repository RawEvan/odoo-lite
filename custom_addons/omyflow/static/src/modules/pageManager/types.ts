export type PageType = 'form' | 'list' | 'kanban';

export type LayoutMode =
  | 'single'
  | 'double'
  | 'triple'
  | 'quad'
  | 'leftOneRightTwo'
  | 'upOneDownTwo'
  | 'leftMainRightStack'
  | 'horizontal';

export type ScrollPosition = 'left' | 'right';

export interface PageNode {
  id: string;
  title: string;
  url: string;
  pageType: PageType;
  createdAt: number;
}

export interface PageGroup {
  id: string;
  mainPage: PageNode;
  secondaryPages: PageNode[];
  createdAt: number;
}

export interface PageState {
  groups: Record<string, PageGroup>;
  groupOrder: string[];
  activeGroupId: string | null;
  activePageId: string | null;
  scrollPosition: ScrollPosition;
  scrollTrigger: number;
  layoutMode: LayoutMode;
}

export type PageAction =
  | { type: 'OPEN_PAGE'; payload: { url: string; title: string; pageType: PageType; sourceGroupId: string | null; sourcePageId: string | null } }
  | { type: 'CLOSE_PAGE'; payload: { groupId: string; pageId: string } }
  | { type: 'CLOSE_GROUP'; payload: { groupId: string } }
  | { type: 'SET_ACTIVE_PAGE'; payload: { groupId: string; pageId: string; scrollPosition?: ScrollPosition } }
  | { type: 'SET_LAYOUT_MODE'; payload: { mode: LayoutMode } }
  | { type: 'SET_SCROLL_TRIGGER'; payload: { trigger: number } };

export interface MenuItem {
  id: number;
  name: string;
  shortName?: string;
  parentId: number | null;
  children: MenuItem[];
  level: number;
  completeName: string;
  webIcon?: string;
  action?: string;
  resModel?: string;
}

export interface MenuRawRecord {
  id: number;
  sequence: number;
  complete_name: string;
  web_icon?: string;
  action?: string;
}

export type ThemeColor = 'odoo' | 'enterprise' | 'navy' | 'teal' | 'forest' | 'slate' | 'indigo' | 'copper';

export interface AppPreferences {
  defaultLayoutMode: LayoutMode;
  primaryColor: ThemeColor;
  secondaryColor: ThemeColor;
  favoriteMenus: number[];
}

export interface ThemeColorInfo {
  primary: string;
  hover: string;
  light: string;
  name: string;
}

export type ModelPageType = 'list' | 'form' | 'kanban';

export interface ModelPageConfig {
  listComponent?: React.ComponentType<any>;
  formComponent?: React.ComponentType<any>;
  kanbanComponent?: React.ComponentType<any>;
  defaultView: ModelPageType;
}

export interface UrlParams {
  model: string;
  viewMode: string;
  recordId: number | null;
  params: Record<string, string>;
}

export interface WebSearchReadParams {
  model: string;
  domain?: any[];
  fields: string[];
  limit?: number;
  offset?: number;
  order?: string;
}

export interface WebSearchReadResult<T> {
  records: T[];
  length: number;
}

export interface WebReadParams {
  model: string;
  ids: number[];
  fields: string[];
}

export interface WriteParams {
  model: string;
  id: number;
  values: Record<string, any>;
}

export interface ActionRecord {
  id: number;
  name: string;
  type: string;
  res_model?: string;
  view_mode?: string;
  domain?: any[];
  context?: any;
  views?: [number, string][];
  url?: string;
  target?: string;
}
