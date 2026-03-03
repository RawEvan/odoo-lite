import React, { useMemo } from 'react';
import { PageNode, UrlParams } from './types';
import { usePages } from './PageContext';
import { getModelPageConfig, hasModelPage } from '../modelPages';
import './PageContent.css';

interface PageContentProps {
  page: PageNode;
  pageNumber: string;
  isActive: boolean;
}

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

export const PageContent: React.FC<PageContentProps> = ({ page, pageNumber, isActive }) => {
  const { state, openPage, closePage } = usePages();
  const urlParams = useMemo(() => parseUrl(page.url), [page.url]);

  const handleOpenRecord = (model: string, recordId: number, title: string) => {
    const groupId = Object.keys(state.groups).find(
      gid => state.groups[gid].mainPage.id === page.id || 
             state.groups[gid].secondaryPages.some(p => p.id === page.id)
    ) || null;
    const pageId = page.id;
    openPage(`/${model}/form/${recordId}`, title, 'form', groupId, pageId);
  };

  const handleClose = () => {
    const groupId = Object.keys(state.groups).find(
      gid => state.groups[gid].mainPage.id === page.id || 
             state.groups[gid].secondaryPages.some(p => p.id === page.id)
    );
    if (groupId) {
      closePage(groupId, page.id);
    }
  };

  const renderContent = () => {
    if (!urlParams) {
      return (
        <div className="page-content__error">
          <p>Invalid URL: {page.url}</p>
        </div>
      );
    }

    const { model, viewMode, recordId, params } = urlParams;

    if (!hasModelPage(model)) {
      return (
        <div className="page-content__not-implemented">
          <p>No custom component for model: {model}</p>
          <p className="page-content__hint">View mode: {viewMode}</p>
        </div>
      );
    }

    const config = getModelPageConfig(model);
    if (!config) {
      return (
        <div className="page-content__error">
          <p>Failed to get page config for model: {model}</p>
        </div>
      );
    }

    let Component: React.ComponentType<any> | undefined;

    switch (viewMode) {
      case 'list':
        Component = config.listComponent;
        break;
      case 'form':
        Component = config.formComponent;
        break;
      case 'kanban':
        Component = config.kanbanComponent;
        break;
    }

    if (!Component) {
      return (
        <div className="page-content__not-implemented">
          <p>View mode "{viewMode}" not implemented for model: {model}</p>
        </div>
      );
    }

    return (
      <Component
        model={model}
        recordId={recordId}
        params={params}
        onOpenRecord={handleOpenRecord}
      />
    );
  };

  return (
    <div className={`page-content ${isActive ? 'page-content--active' : ''}`}>
      <div className="page-content__header">
        <div className="page-content__number">{pageNumber}</div>
        <h3 className="page-content__title">{page.title}</h3>
        <button className="page-content__close" onClick={handleClose} title="Close">
          ×
        </button>
      </div>
      <div className="page-content__body">
        {renderContent()}
      </div>
    </div>
  );
};
