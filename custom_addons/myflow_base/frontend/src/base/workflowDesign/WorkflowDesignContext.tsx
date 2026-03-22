import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type {
  ComponentPlacement,
  LayoutDefinition,
  WorkflowDesign,
} from "../runtime/workflowService";
import { deleteWorkflow, EMPTY_LAYOUT, saveWorkflow } from "../runtime/workflowService";

export interface WorkflowDesignCtx {
  workflows: WorkflowDesign[];
  /** `new` = creating a workflow not yet persisted. */
  selectedId: number | "new" | null;
  setSelectedId: (id: number | "new" | null) => void;
  draft: WorkflowDesign | null;
  updateDraftField: <K extends keyof WorkflowDesign>(field: K, value: WorkflowDesign[K]) => void;
  updateDraftLayout: (layout: LayoutDefinition) => void;
  addComponent: (area: "left" | "middle" | "right", placement: ComponentPlacement) => void;
  removeComponent: (area: "left" | "middle" | "right", index: number) => void;
  updateComponentSize: (
    area: "left" | "middle" | "right",
    index: number,
    size: "full" | "half"
  ) => void;
  updateComponentMenuViewType: (
    area: "left" | "middle" | "right",
    index: number,
    menuViewType: string
  ) => void;
  setAreaWidth: (area: "left" | "middle" | "right", width: string) => void;
  dirty: boolean;
  saving: boolean;
  deleting: boolean;
  message: string | null;
  handleSave: () => void;
  handleDeleteWorkflow: (id: number) => Promise<void>;
  navigateToWorkflowKey: (key: string) => void;
}

const Ctx = createContext<WorkflowDesignCtx | null>(null);

export const useWorkflowDesign = (): WorkflowDesignCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWorkflowDesign must be used inside WorkflowDesignProvider");
  return c;
};

interface ProviderProps {
  workflows: WorkflowDesign[];
  onSaved: () => void;
  navigateToWorkflowKey: (key: string) => void;
  children: React.ReactNode;
}

export const WorkflowDesignProvider: React.FC<ProviderProps> = ({
  workflows,
  onSaved,
  navigateToWorkflowKey,
  children,
}) => {
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<WorkflowDesign | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const workflowsRef = useRef(workflows);
  workflowsRef.current = workflows;

  const selected =
    typeof selectedId === "number" ? workflows.find((w) => w.id === selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId !== "new") return;
    const list = workflowsRef.current;
    const maxSeq = list.reduce((m, w) => Math.max(m, w.sequence ?? 0), 0);
    setDraft({
      name: "New workflow",
      key: `new-workflow-${Math.random().toString(36).slice(2, 10)}`,
      description: "",
      layout: EMPTY_LAYOUT,
      sequence: maxSeq + 10,
      active: true,
    });
    setMessage(null);
  }, [selectedId]);

  useEffect(() => {
    if (selectedId === "new" || selectedId === null) {
      if (selectedId === null) setDraft(null);
      return;
    }
    if (selected) {
      setDraft({ ...selected, layout: selected.layout ?? EMPTY_LAYOUT });
      setMessage(null);
    }
  }, [selectedId, selected]);

  const updateDraftField = <K extends keyof WorkflowDesign>(field: K, value: WorkflowDesign[K]) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const updateDraftLayout = (layout: LayoutDefinition) => {
    setDraft((prev) => (prev ? { ...prev, layout } : null));
  };

  const ensureLayout = (): LayoutDefinition => draft?.layout ?? EMPTY_LAYOUT;

  const addComponent = (area: "left" | "middle" | "right", placement: ComponentPlacement) => {
    const lo = ensureLayout();
    const updated = {
      ...lo,
      [area]: { ...lo[area], components: [...lo[area].components, placement] },
    };
    updateDraftLayout(updated);
  };

  const removeComponent = (area: "left" | "middle" | "right", index: number) => {
    const lo = ensureLayout();
    const comps = [...lo[area].components];
    comps.splice(index, 1);
    updateDraftLayout({ ...lo, [area]: { ...lo[area], components: comps } });
  };

  const updateComponentSize = (
    area: "left" | "middle" | "right",
    index: number,
    size: "full" | "half"
  ) => {
    const lo = ensureLayout();
    const comps = [...lo[area].components];
    comps[index] = { ...comps[index], size };
    updateDraftLayout({ ...lo, [area]: { ...lo[area], components: comps } });
  };

  const updateComponentMenuViewType = (
    area: "left" | "middle" | "right",
    index: number,
    menuViewType: string
  ) => {
    const lo = ensureLayout();
    const comps = [...lo[area].components];
    comps[index] = { ...comps[index], menuViewType };
    updateDraftLayout({ ...lo, [area]: { ...lo[area], components: comps } });
  };

  const setAreaWidth = (area: "left" | "middle" | "right", width: string) => {
    const lo = ensureLayout();
    updateDraftLayout({ ...lo, [area]: { ...lo[area], width } });
  };

  const dirty = Boolean(
    draft &&
      (selectedId === "new" ||
        (selected && JSON.stringify(draft) !== JSON.stringify(selected)))
  );

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload: Parameters<typeof saveWorkflow>[0] = {
        name: draft.name,
        key: draft.key,
        description: draft.description,
        layout: draft.layout,
        sequence: draft.sequence,
        active: draft.active,
      };
      if (typeof selectedId === "number" && draft.id != null) {
        payload.id = draft.id;
      }
      const result = await saveWorkflow(payload);
      setMessage("Saved successfully.");
      onSaved();
      if (selectedId === "new") {
        setSelectedId(result.id);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkflow = async (id: number) => {
    setDeleting(true);
    setMessage(null);
    try {
      await deleteWorkflow(id);
      setMessage("Workflow deleted.");
      onSaved();
      if (selectedId === id) {
        setSelectedId(null);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const value: WorkflowDesignCtx = {
    workflows,
    selectedId,
    setSelectedId,
    draft,
    updateDraftField,
    updateDraftLayout,
    addComponent,
    removeComponent,
    updateComponentSize,
    updateComponentMenuViewType,
    setAreaWidth,
    dirty,
    saving,
    deleting,
    message,
    handleSave: () => void handleSave(),
    handleDeleteWorkflow,
    navigateToWorkflowKey,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
