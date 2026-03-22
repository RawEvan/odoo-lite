import React, { useEffect, useState } from "react";
import type { ComponentMeta, WorkflowComponentProps, WorkflowUiPlugin } from "../runtime/pluginTypes";
import { MenuLinkedPageEmbed } from "../runtime/menuRenderEngine";
import { listOdooMenuComponents, type OdooMenuCatalogItem } from "../runtime/odooViewService";

export { menuActionUrlWithViewType } from "../runtime/menuRenderEngine";

const MenuLinkComponent: React.FC<{ item: OdooMenuCatalogItem } & WorkflowComponentProps> = ({
  item,
  menuViewType,
  onMenuViewTypeChange,
}) => {
  const viewTypes = Array.isArray(item.view_types) ? item.view_types : [];
  const fallback = viewTypes[0] || "";
  const [localVt, setLocalVt] = useState(fallback);

  useEffect(() => {
    if (onMenuViewTypeChange !== undefined) return;
    if (menuViewType !== undefined) setLocalVt(menuViewType || fallback);
  }, [menuViewType, fallback, onMenuViewTypeChange]);

  const selectedVt =
    onMenuViewTypeChange !== undefined
      ? (menuViewType ?? fallback)
      : (menuViewType !== undefined ? menuViewType || fallback : localVt);

  const embedVt = selectedVt || fallback;

  return (
    <div className="menu-linked-component-root">
      <MenuLinkedPageEmbed item={item} viewType={embedVt} openInNewTabLabel="Open menu action in new tab" />
    </div>
  );
};

export async function buildOdooMenuLinksPlugin(): Promise<WorkflowUiPlugin | null> {
  const items: OdooMenuCatalogItem[] = [];
  const pageSize = 500;
  const maxRows = 10000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const chunk = await listOdooMenuComponents({ limit: pageSize, offset });
    items.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  if (items.length === 0) return null;

  const componentCatalog: ComponentMeta[] = items.map((item) => {
    const viewTypes = Array.isArray(item.view_types) ? [...item.view_types] : [];
    const viewType = viewTypes[0] || "";
    const compactPath = item.complete_name || item.name || "Menu";
    return {
      key: item.key,
      name: compactPath,
      description: `Menu action for ${item.res_model || "unknown.model"} (${viewTypes.join(", ") || "view"})`,
      defaultSize: "full",
      category: "Menu Linked",
      source: "menu",
      model: item.res_model || "",
      viewType,
      viewTypes: viewTypes.length ? viewTypes : undefined,
      menuId: item.id,
      actionId: item.action_id,
      menuPath: item.complete_name || item.name || "",
      menuRoot: item.root || "Menus",
      actionType: item.action_type || "",
    };
  });

  const components: WorkflowUiPlugin["components"] = {};
  for (const item of items) {
    components[item.key] = (props) => <MenuLinkComponent item={item} {...props} />;
  }

  return {
    id: "odoo-menu-links-plugin",
    componentCatalog,
    components,
  };
}
