import React from "react";
import type { ComponentPlacement } from "./workflowService";
import type { ComponentMeta, WorkflowComponentProps, WorkflowUiPlugin } from "./pluginTypes";

export type { WorkflowComponentProps };

let COMPONENT_MAP: Record<string, React.ComponentType<WorkflowComponentProps>> = {};
let COMPONENT_CATALOG: ComponentMeta[] = [];

export const registerPlugins = (plugins: WorkflowUiPlugin[]) => {
  COMPONENT_MAP = {};
  COMPONENT_CATALOG = [];
  for (const plugin of plugins) {
    COMPONENT_MAP = { ...COMPONENT_MAP, ...plugin.components };
    COMPONENT_CATALOG.push(...plugin.componentCatalog);
  }
};

export const getComponentCatalog = (): ComponentMeta[] => COMPONENT_CATALOG;

const getComponent = (key: string): React.ComponentType<WorkflowComponentProps> | null =>
  COMPONENT_MAP[key] ?? null;

export const ComponentRenderer: React.FC<{
  componentKey: string;
  menuViewType?: string;
  onMenuViewTypeChange?: (viewType: string) => void;
}> = ({ componentKey, menuViewType, onMenuViewTypeChange }) => {
  const Comp = getComponent(componentKey);
  if (!Comp) {
    return <div className="area-component-missing">Unknown component: {componentKey}</div>;
  }
  return <Comp menuViewType={menuViewType} onMenuViewTypeChange={onMenuViewTypeChange} />;
};

export const AreaRenderer: React.FC<{ components: ComponentPlacement[] }> = ({ components }) => {
  if (components.length === 0) return null;
  return (
    <div className="area-content">
      {components.map((p, i) => {
        const Comp = getComponent(p.key);
        if (!Comp) {
          return (
            <div key={i} className="area-component-missing">
              Unknown component: {p.key}
            </div>
          );
        }
        return (
          <div key={`${p.key}-${i}`} className={`area-component size-${p.size}`}>
            <Comp menuViewType={p.menuViewType} />
          </div>
        );
      })}
    </div>
  );
};
