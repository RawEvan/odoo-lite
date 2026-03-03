import React, { useMemo } from 'react';
import { usePages } from './PageContext';
import { PageContent } from './PageContent';
import { PageNode, UrlParams } from './types';
import { getModelPageConfig, hasModelPage } from '../modelPages';
import './PageContainer.css';

const parseUrl = (url: string): UrlParams | null => {
  const modelMatch = url.match(/^\/([a-z.]+)\/(list|form|kanban)(?:\/(\d+))?(?:\?(.*))?$/);
  if (!modelMatch) return null;

  const [, model, viewMode, recordId, queryString] = modelMatch;
  const params: Record<string, string> = {};

  if (queryString) {
    queryString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key && value) {
        params[key] = value;
      }
    });
  }

  return {
    model,
    viewMode,
    recordId: recordId ? parseInt(recordId, 10) : null,
    params,
  };
};

const getPageNumber = (
  groupIndex: number,
  isMainPage: boolean,
  secondaryIndex: number
): string => {
  if (isMainPage) {
    return `${groupIndex + 1}`;
  }
  return `${groupIndex + 1}.${secondaryIndex + 1}`;
};

export const PageContainer: React.FC = () => {
  const { state } = usePages();
  const { groups, groupOrder, activeGroupId, activePageId, layoutMode } = state;

  const allPages = useMemo(() => {
    const pages: Array<{ page: PageNode; groupIndex: number; isMainPage: boolean; secondaryIndex: number }> = [];

    groupOrder.forEach((groupId, groupIndex) => {
      const group = groups[groupId];
      if (!group) return;

      pages.push({
        page: group.mainPage,
        groupIndex,
        isMainPage: true,
        secondaryIndex: 0,
      });

      group.secondaryPages.forEach((page, secondaryIndex) => {
        pages.push({
          page,
          groupIndex,
          isMainPage: false,
          secondaryIndex,
        });
      });
    });

    return pages;
  }, [groups, groupOrder]);

  if (allPages.length === 0) {
    return (
      <div className="page-container page-container--empty">
        <div className="page-container__empty-message">
          <p>No pages open</p>
          <p className="page-container__empty-hint">Select a menu item from the sidebar to get started</p>
        </div>
      </div>
    );
  }

  if (layoutMode === 'leftMainRightStack') {
    const activeGroup = activeGroupId ? groups[activeGroupId] : null;
    if (!activeGroup) {
      return (
        <div className="page-container">
          <div className="page-container__viewport page-container__viewport--stack">
            <div className="page-container__empty-message">
              <p>No active group</p>
            </div>
          </div>
        </div>
      );
    }

    const groupIndex = groupOrder.indexOf(activeGroupId!);
    const mainPageNumber = getPageNumber(groupIndex, true, 0);

    return (
      <div className="page-container">
        <div className="page-container__viewport page-container__viewport--stack">
          <div className="page-container__main-page">
            <PageContent
              page={activeGroup.mainPage}
              pageNumber={mainPageNumber}
              isActive={activePageId === activeGroup.mainPage.id}
            />
          </div>
          {activeGroup.secondaryPages.length > 0 && (
            <div className="page-container__right-stack">
              {activeGroup.secondaryPages.map((page, index) => (
                <div key={page.id} className="page-container__stack-item">
                  <PageContent
                    page={page}
                    pageNumber={getPageNumber(groupIndex, false, index)}
                    isActive={activePageId === page.id}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const visiblePages = (() => {
    switch (layoutMode) {
      case 'single':
        return allPages.filter(p => p.page.id === activePageId);
      case 'double':
        return allPages.slice(0, 2);
      case 'triple':
        return allPages.slice(0, 3);
      case 'quad':
        return allPages.slice(0, 4);
      case 'leftOneRightTwo':
        return allPages.slice(0, 3);
      case 'upOneDownTwo':
        return allPages.slice(0, 3);
      case 'horizontal':
        return allPages;
      default:
        return allPages;
    }
  })();

  return (
    <div className="page-container">
      <div className="page-container__viewport">
        <div className={`page-container__pages page-container__pages--${layoutMode}`}>
          {visiblePages.map(({ page, groupIndex, isMainPage, secondaryIndex }) => (
            <div key={page.id} className="page-container__page">
              <PageContent
                page={page}
                pageNumber={getPageNumber(groupIndex, isMainPage, secondaryIndex)}
                isActive={activePageId === page.id}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
