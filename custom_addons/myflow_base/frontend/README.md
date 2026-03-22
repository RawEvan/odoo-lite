# Myflow Base Frontend

Host UI for workflow pages served by the Odoo addon **`myflow_base`**.  
Extension addons ship their **own** Vite bundle + hub URL and register **plugins** that supply panels for `cr.workflow.design` layouts.

## Architecture (short)

| Piece | Role |
|--------|------|
| **`myflow_base`** | Model `cr.workflow.design`, HTTP `/myflow_base` + `/workflow/<key>`, JSON list/save APIs, **canonical** `src/base/**` runtime. |
| **Extension addon** (e.g. `cr_product_configurations`) | Own hub route (e.g. `/cr_product_configurations`), own `frontend/` build → `static/src`, **plugins** under `frontend/src/plugins/**`, module-specific JSON-RPC routes. |
| **Workflow record** | XML (or UI) defines `key`, `name`, and `layout` JSON (`left` / `middle` / `right` areas with `components[].key` matching plugin catalog keys). |

Standalone workflow URLs are always **`/workflow/<workflow_key>`** (no module prefix). The shell remembers which hub you came from via `sessionStorage` so APIs still hit the right prefix.

---

## Canonical code & avoiding drift

- **Single source of truth:** `myflow_base/frontend/src/base/` (runtime shell, workflow design editor, types, base plugins).
- **Extension frontends** should not hand-edit copied `src/base`; use the sync step in the extension’s `package.json` (see *Extension addon frontend* below).

---

## Plugin loading boundary

- **`myflow_base`** only auto-loads plugins from `./src/base/plugins/**`.
- The host stays **self-contained** and does **not** import plugin code from sibling addons.
- Extension addons load plugins from their own `./src/plugins/**/*.tsx` (see `cr_product_configurations`).

---

## Create a new workflow extension module

Use **`cr_product_configurations`** as the reference implementation.

### 1. Odoo addon skeleton

1. Create a new module directory, e.g. `cr_my_workflow/`.
2. **`__manifest__.py`**
   - `depends`: include **`myflow_base`** and any models you need (e.g. `product`, `sale`).
   - `data`: include a workflow design XML file (step 3) and menu/actions as needed.
3. **`__init__.py`**: import `controllers`, `models` if present.

### 2. Workflow design record (`cr.workflow.design`)

Add a data XML file (or create the record in the UI) with:

- **`key`**: stable identifier, used in URLs (`/workflow/<key>`) and in plugin `wrap` checks.
- **`name`**, **`sequence`**, **`description`**, **`active`**.
- **`layout`**: JSON string with `left`, `middle`, `right`. Each area may have `width` and `components`: `[{ "key": "<panel-key>", "size": "full" | "half" }]`.

Panel **`key`** values must match entries in your plugin’s `componentCatalog` / `components` map.

Example (structure only):

```xml
<record id="workflow_my_feature" model="cr.workflow.design">
    <field name="name">My Feature</field>
    <field name="key">my-feature</field>
    <field name="sequence">20</field>
    <field name="layout">{"left":{"components":[{"key":"my-panel","size":"full"}]},"middle":{"components":[]},"right":{"components":[]}}</field>
</record>
```

### 3. Hub page (HTTP)

Serve the SPA using the **same built assets** as workflow base (recommended):

- In your controller, use Jinja loader: `odoo.addons.myflow_base.static` → template `index.html` (same pattern as `cr_product_configurations/controllers/main.py`).
- Expose a **module-specific hub URL**, e.g. `/cr_my_workflow`, so `rememberHubContextFromPath()` can set API + “back” links.

### 4. JSON-RPC: workflow list/save + your APIs

- **List / save workflows** are implemented on **`myflow_base`** and already duplicated for product hub paths in `WorkflowBaseApi` (see routes like `/myflow_base/api/workflows/list` and `/cr_product_configurations/api/workflows/list`).
- For a **new hub prefix**, add matching route aliases on `WorkflowBaseApi` (or a thin controller in your module that delegates the same way) so calls from your hub URL resolve correctly.
- Put **module-specific** JSON routes under `/cr_my_workflow/api/...` in your addon’s controller.

### 5. Runtime: hub + API prefix (`hostRuntime.ts`)

The canonical file lives in **`myflow_base/frontend/src/base/runtime/hostRuntime.ts`**.  
If you introduce a new hub path, extend:

- `VALID_API_PREFIXES`
- `rememberHubContextFromPath()` (path detection for your `/cr_my_workflow` hub)

Then run your extension’s **`sync:base`** (or copy manually) so the product frontend picks up the change.

### 6. Extension addon frontend

1. Copy the **Vite + React** layout from `cr_product_configurations/frontend` as a template (`package.json`, `tsconfig`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `index.html`).
2. Set Vite **`base`** to `/cr_my_workflow/static/src` (must match where Odoo serves the built files).
3. **`src/App.tsx`**: keep the pattern `WorkflowShell` + `import.meta.glob("./base/plugins/**/*.tsx")` + `import.meta.glob("./plugins/**/*.tsx")`.
4. Add **`scripts/sync-base-from-myflow-base.mjs`** (or equivalent) and wire:
   - `"sync:base": "node ./scripts/sync-base-from-myflow-base.mjs"`
   - `"dev": "npm run sync:base && vite"`
   - `"build": "npm run sync:base && tsc && vite build"`  
   so **`src/base`** always matches **`myflow_base/frontend/src/base`** before compile.

### 7. Register a plugin

Create `src/plugins/<name>/<something>Plugin.tsx` exporting a **`WorkflowUiPlugin`** object:

- **`id`**: unique string.
- **`componentCatalog`**: metadata for each panel `key` (name, description, `defaultSize`, `category`).
- **`components`**: map `key` → React component.
- **`wrap`** (optional): if `activeWorkflowKey === "<your-workflow-key>"`, wrap children with providers (context) for that workflow only.

Export the plugin as a **named export**; the glob loader collects exported objects that satisfy the plugin shape.

See `cr_product_configurations/frontend/src/plugins/attributesCombinations/attributesCombinationsPlugin.tsx`.

### 8. Dev proxy (`vite.config.ts`)

Proxy to your Odoo backend:

- `/web`, `/odoo`
- `/cr_my_workflow/api` (your JSON routes)
- `/myflow_base/api` (workflow list/save)
- `/workflow` (standalone workflow pages)

### 9. Build & deploy

```bash
cd cr_my_workflow/frontend && npm install && npm run build
```

Commit the generated **`static/src`** assets (or run build in CI before packaging), upgrade the module in Odoo.

### 10. Smoke test

- Open hub: `/cr_my_workflow` (or your path) — tab bar and `?wf=<key>` should work.
- Open standalone: `/workflow/<key>` after visiting a hub once (session context), or ensure defaults in `hostRuntime` point to a valid API prefix.
- Workflow Design (if enabled) should list your workflow and show your panel keys in the layout editor.

---

## Files to study

| Area | Location |
|------|-----------|
| Base HTTP + workflow JSON API | `myflow_base/controllers/main.py` |
| Workflow model | `myflow_base/models/workflow_design.py` |
| Shell, URL binding, plugins | `myflow_base/frontend/src/base/runtime/` |
| Plugin type | `myflow_base/frontend/src/base/runtime/pluginTypes.ts` |
| Full extension example | `cr_product_configurations/` |

---

## Why the host does not load sibling plugins

Loading `./plugins` from other addons at build time couples the **host** bundle to every sibling’s frontend and breaks if any of them fail to compile. Extension hubs avoid that and keep installs independent.
