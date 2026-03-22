import React from "react";
import type { WorkflowDesign } from "./workflowService";

/** Props passed to registered workflow area components (optional; plugins may ignore). */
export type WorkflowComponentProps = {
  menuViewType?: string;
  onMenuViewTypeChange?: (viewType: string) => void;
};

export interface ComponentMeta {
  key: string;
  name: string;
  description: string;
  defaultSize: "full" | "half";
  category: string;
  source?: "native" | "odoo-view" | "menu" | "customized" | string;
  model?: string;
  /** Primary view mode for this entry (e.g. action’s default). */
  viewType?: string;
  /** All view types exposed by the action (tree/list, form, …). */
  viewTypes?: string[];
  menuId?: number;
  actionId?: number;
  menuPath?: string;
  menuRoot?: string;
  actionType?: string;
}

export interface WorkflowUiPluginContext {
  activeWorkflowKey: string;
  workflows: WorkflowDesign[];
  reloadWorkflows: () => void;
  /** Switch hub tab or navigate standalone page to the workflow with this key. */
  navigateToWorkflowKey: (key: string) => void;
  children: React.ReactNode;
}

export interface WorkflowUiPlugin {
  id: string;
  componentCatalog: ComponentMeta[];
  components: Record<string, React.ComponentType<WorkflowComponentProps>>;
  wrap?: (ctx: WorkflowUiPluginContext) => React.ReactNode;
}
