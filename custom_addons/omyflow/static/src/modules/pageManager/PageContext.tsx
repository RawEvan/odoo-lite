import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { PageState, PageAction, PageGroup, PageNode, LayoutMode, PageType } from './types';

const STORAGE_KEY = 'omyflow_page_state';
const PREFERENCES_KEY = 'omyflow_preferences';

const loadStoredState = (): Partial<PageState> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load stored state:', e);
  }
  return {};
};

const saveState = (state: PageState): void => {
  try {
    const toStore = {
      groupOrder: state.groupOrder,
      activeGroupId: state.activeGroupId,
      layoutMode: state.layoutMode,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (e) {
    console.warn('Failed to save state:', e);
  }
};

const generateId = (): string => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const findExistingPageInGroup = (group: PageGroup, targetUrl: string): PageNode | null => {
  if (group.mainPage.url === targetUrl) return group.mainPage;
  return group.secondaryPages.find(p => p.url === targetUrl) || null;
};

const getInitialLayoutMode = (): LayoutMode => {
  try {
    const prefs = localStorage.getItem(PREFERENCES_KEY);
    if (prefs) {
      const parsed = JSON.parse(prefs);
      return parsed.defaultLayoutMode || 'single';
    }
  } catch (e) {
    console.warn('Failed to load preferences:', e);
  }
  return 'single';
};

const initialState: PageState = {
  groups: {},
  groupOrder: [],
  activeGroupId: null,
  activePageId: null,
  scrollPosition: 'left',
  scrollTrigger: 0,
  layoutMode: getInitialLayoutMode(),
  ...loadStoredState(),
};

const pageReducer = (state: PageState, action: PageAction): PageState => {
  let newState: PageState;

  switch (action.type) {
    case 'OPEN_PAGE': {
      const { url, title, pageType, sourceGroupId, sourcePageId } = action.payload;

      if (!sourceGroupId) {
        const newPageId = generateId();
        const newGroupId = generateId();
        const newPage: PageNode = {
          id: newPageId,
          title,
          url,
          pageType,
          createdAt: Date.now(),
        };
        const newGroup: PageGroup = {
          id: newGroupId,
          mainPage: newPage,
          secondaryPages: [],
          createdAt: Date.now(),
        };
        newState = {
          ...state,
          groups: { ...state.groups, [newGroupId]: newGroup },
          groupOrder: [...state.groupOrder, newGroupId],
          activeGroupId: newGroupId,
          activePageId: newPageId,
        };
        break;
      }

      const sourceGroup = state.groups[sourceGroupId];
      if (!sourceGroup) {
        return state;
      }

      const existingPage = findExistingPageInGroup(sourceGroup, url);
      if (existingPage) {
        newState = {
          ...state,
          activeGroupId: sourceGroupId,
          activePageId: existingPage.id,
        };
        break;
      }

      if (sourceGroup.mainPage.pageType === 'form') {
        const newPageId = generateId();
        const newPage: PageNode = {
          id: newPageId,
          title,
          url,
          pageType,
          createdAt: Date.now(),
        };
        const updatedGroup: PageGroup = {
          ...sourceGroup,
          secondaryPages: [...sourceGroup.secondaryPages, newPage],
        };
        newState = {
          ...state,
          groups: { ...state.groups, [sourceGroupId]: updatedGroup },
          activeGroupId: sourceGroupId,
          activePageId: newPageId,
        };
        break;
      }

      if (sourcePageId) {
        const sourcePage = sourceGroup.mainPage.id === sourcePageId
          ? sourceGroup.mainPage
          : sourceGroup.secondaryPages.find(p => p.id === sourcePageId);

        if (sourcePage && sourcePage.pageType === 'form') {
          const newPageId = generateId();
          const newGroupId = generateId();
          const newPage: PageNode = {
            id: newPageId,
            title,
            url,
            pageType,
            createdAt: Date.now(),
          };
          const newMainPage: PageNode = {
            ...sourcePage,
            id: generateId(),
            createdAt: Date.now(),
          };
          const newGroup: PageGroup = {
            id: newGroupId,
            mainPage: newMainPage,
            secondaryPages: [newPage],
            createdAt: Date.now(),
          };
          newState = {
            ...state,
            groups: { ...state.groups, [newGroupId]: newGroup },
            groupOrder: [...state.groupOrder, newGroupId],
            activeGroupId: newGroupId,
            activePageId: newPageId,
          };
          break;
        }
      }

      const newPageId = generateId();
      const newPage: PageNode = {
        id: newPageId,
        title,
        url,
        pageType,
        createdAt: Date.now(),
      };
      const updatedGroup: PageGroup = {
        ...sourceGroup,
        secondaryPages: [...sourceGroup.secondaryPages, newPage],
      };
      newState = {
        ...state,
        groups: { ...state.groups, [sourceGroupId]: updatedGroup },
        activeGroupId: sourceGroupId,
        activePageId: newPageId,
      };
      break;
    }

    case 'CLOSE_PAGE': {
      const { groupId, pageId } = action.payload;
      const group = state.groups[groupId];
      if (!group) return state;

      if (group.mainPage.id === pageId) {
        const { [groupId]: _, ...remainingGroups } = state.groups;
        const newGroupOrder = state.groupOrder.filter(id => id !== groupId);
        let newActiveGroupId = state.activeGroupId;
        let newActivePageId = state.activePageId;

        if (state.activeGroupId === groupId) {
          newActiveGroupId = newGroupOrder.length > 0 ? newGroupOrder[newGroupOrder.length - 1] : null;
          if (newActiveGroupId && remainingGroups[newActiveGroupId]) {
            newActivePageId = remainingGroups[newActiveGroupId].mainPage.id;
          } else {
            newActivePageId = null;
          }
        }

        newState = {
          ...state,
          groups: remainingGroups,
          groupOrder: newGroupOrder,
          activeGroupId: newActiveGroupId,
          activePageId: newActivePageId,
        };
        break;
      }

      const updatedSecondaryPages = group.secondaryPages.filter(p => p.id !== pageId);
      const updatedGroup: PageGroup = {
        ...group,
        secondaryPages: updatedSecondaryPages,
      };
      let newActivePageId = state.activePageId;
      if (state.activePageId === pageId) {
        newActivePageId = group.mainPage.id;
      }

      newState = {
        ...state,
        groups: { ...state.groups, [groupId]: updatedGroup },
        activePageId: newActivePageId,
      };
      break;
    }

    case 'CLOSE_GROUP': {
      const { groupId } = action.payload;
      const { [groupId]: _, ...remainingGroups } = state.groups;
      const newGroupOrder = state.groupOrder.filter(id => id !== groupId);
      let newActiveGroupId = state.activeGroupId;
      let newActivePageId = state.activePageId;

      if (state.activeGroupId === groupId) {
        newActiveGroupId = newGroupOrder.length > 0 ? newGroupOrder[newGroupOrder.length - 1] : null;
        if (newActiveGroupId && remainingGroups[newActiveGroupId]) {
          newActivePageId = remainingGroups[newActiveGroupId].mainPage.id;
        } else {
          newActivePageId = null;
        }
      }

      newState = {
        ...state,
        groups: remainingGroups,
        groupOrder: newGroupOrder,
        activeGroupId: newActiveGroupId,
        activePageId: newActivePageId,
      };
      break;
    }

    case 'SET_ACTIVE_PAGE': {
      const { groupId, pageId, scrollPosition } = action.payload;
      newState = {
        ...state,
        activeGroupId: groupId,
        activePageId: pageId,
        ...(scrollPosition && { scrollPosition }),
      };
      break;
    }

    case 'SET_LAYOUT_MODE': {
      const { mode } = action.payload;
      newState = {
        ...state,
        layoutMode: mode,
      };
      break;
    }

    case 'SET_SCROLL_TRIGGER': {
      const { trigger } = action.payload;
      newState = {
        ...state,
        scrollTrigger: trigger,
      };
      break;
    }

    default:
      return state;
  }

  saveState(newState);
  return newState;
};

interface PageContextValue {
  state: PageState;
  openPage: (url: string, title: string, pageType: PageType, sourceGroupId: string | null, sourcePageId: string | null) => void;
  closePage: (groupId: string, pageId: string) => void;
  closeGroup: (groupId: string) => void;
  setActivePage: (groupId: string, pageId: string, scrollPosition?: 'left' | 'right') => void;
  setLayoutMode: (mode: LayoutMode) => void;
  triggerScroll: () => void;
}

const PageContext = createContext<PageContextValue | null>(null);

export const PageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(pageReducer, initialState);

  const openPage = useCallback((
    url: string,
    title: string,
    pageType: PageType,
    sourceGroupId: string | null,
    sourcePageId: string | null
  ) => {
    dispatch({ type: 'OPEN_PAGE', payload: { url, title, pageType, sourceGroupId, sourcePageId } });
  }, []);

  const closePage = useCallback((groupId: string, pageId: string) => {
    dispatch({ type: 'CLOSE_PAGE', payload: { groupId, pageId } });
  }, []);

  const closeGroup = useCallback((groupId: string) => {
    dispatch({ type: 'CLOSE_GROUP', payload: { groupId } });
  }, []);

  const setActivePage = useCallback((groupId: string, pageId: string, scrollPosition?: 'left' | 'right') => {
    dispatch({ type: 'SET_ACTIVE_PAGE', payload: { groupId, pageId, scrollPosition } });
  }, []);

  const setLayoutMode = useCallback((mode: LayoutMode) => {
    dispatch({ type: 'SET_LAYOUT_MODE', payload: { mode } });
  }, []);

  const triggerScroll = useCallback(() => {
    dispatch({ type: 'SET_SCROLL_TRIGGER', payload: { trigger: Date.now() } });
  }, []);

  return (
    <PageContext.Provider value={{ state, openPage, closePage, closeGroup, setActivePage, setLayoutMode, triggerScroll }}>
      {children}
    </PageContext.Provider>
  );
};

export const usePages = (): PageContextValue => {
  const context = useContext(PageContext);
  if (!context) {
    throw new Error('usePages must be used within a PageProvider');
  }
  return context;
};

export { PageContext };
