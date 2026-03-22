import {
  WorkflowAddBuilderComponent,
  WorkflowCustomizationComponent,
  WorkflowEditorComponent,
  WorkflowListComponent,
} from "../workflowDesign/WorkflowDesignPanel";
import { WorkflowDesignProvider } from "../workflowDesign/WorkflowDesignContext";
import type { WorkflowComponentProps, WorkflowUiPlugin } from "../runtime/pluginTypes";

export const workflowDesignPlugin: WorkflowUiPlugin = {
  id: "workflow-design-base-plugin",
  componentCatalog: [
    {
      key: "workflow-list",
      name: "Workflow List",
      description: "Browse and select workflow designs",
      defaultSize: "full",
      category: "Workflow",
      source: "customized",
    },
    {
      key: "workflow-editor",
      name: "Workflow Editor",
      description: "Edit workflow definition and component layout",
      defaultSize: "full",
      category: "Workflow",
      source: "customized",
    },
    {
      key: "workflow-customization",
      name: "Workflow Customization",
      description: "Configure panel widths and general settings",
      defaultSize: "full",
      category: "Workflow",
      source: "customized",
    },
    {
      key: "workflow-add-builder",
      name: "Add Workflow Builder",
      description: "Build and save a new workflow from available menus/components",
      defaultSize: "full",
      category: "Workflow",
      source: "customized",
    },
  ],
  components: {
    "workflow-list": (_props: WorkflowComponentProps) => <WorkflowListComponent />,
    "workflow-editor": (_props: WorkflowComponentProps) => <WorkflowEditorComponent />,
    "workflow-customization": (_props: WorkflowComponentProps) => <WorkflowCustomizationComponent />,
    "workflow-add-builder": (_props: WorkflowComponentProps) => <WorkflowAddBuilderComponent />,
  },
  wrap: ({ activeWorkflowKey, workflows, reloadWorkflows, navigateToWorkflowKey, children }) => {
    if (activeWorkflowKey !== "workflow-design" && activeWorkflowKey !== "add-workflow") {
      return children;
    }
    return (
      <WorkflowDesignProvider
        workflows={workflows}
        onSaved={reloadWorkflows}
        navigateToWorkflowKey={navigateToWorkflowKey}
      >
        {children}
      </WorkflowDesignProvider>
    );
  },
};
