import { WebSearchReadParams, WebSearchReadResult, WebReadParams, WriteParams, ActionRecord, MenuRawRecord } from '../modules/pageManager/types';

const ODOO_BASE_URL = '/web';

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  id: number;
  params: Record<string, any>;
}

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result: T;
}

let requestId = 0;

async function jsonRpc<T>(endpoint: string, method: string, params: Record<string, any>): Promise<T> {
  const body: JsonRpcRequest = {
    jsonrpc: '2.0',
    method: 'call',
    id: ++requestId,
    params,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data: JsonRpcResponse<T> = await response.json();

  if ((data as any).error) {
    throw new Error((data as any).error.message || 'RPC error');
  }

  return data.result;
}

export class OdooService {
  private static instance: OdooService;

  private constructor() {}

  static getInstance(): OdooService {
    if (!OdooService.instance) {
      OdooService.instance = new OdooService();
    }
    return OdooService.instance;
  }

  async webSearchRead<T>(params: WebSearchReadParams): Promise<WebSearchReadResult<T>> {
    return jsonRpc<WebSearchReadResult<T>>(`${ODOO_BASE_URL}/dataset/call_kw/${params.model}/web_search_read`, 'call', {
      model: params.model,
      method: 'web_search_read',
      args: [],
      kwargs: {
        domain: params.domain || [],
        fields: params.fields,
        limit: params.limit,
        offset: params.offset,
        order: params.order,
      },
    });
  }

  async webRead<T>(params: WebReadParams): Promise<T[]> {
    return jsonRpc<T[]>(`${ODOO_BASE_URL}/dataset/call_kw/${params.model}/web_read`, 'call', {
      model: params.model,
      method: 'web_read',
      args: [params.ids],
      kwargs: {
        fields: params.fields,
      },
    });
  }

  async write(params: WriteParams): Promise<boolean> {
    return jsonRpc<boolean>(`${ODOO_BASE_URL}/dataset/call_kw/${params.model}/write`, 'call', {
      model: params.model,
      method: 'write',
      args: [[params.id], params.values],
      kwargs: {},
    });
  }

  async nameSearch(params: {
    model: string;
    name?: string;
    limit?: number;
  }): Promise<[number, string][]> {
    return jsonRpc<[number, string][]>(`${ODOO_BASE_URL}/dataset/call_kw/${params.model}/name_search`, 'call', {
      model: params.model,
      method: 'name_search',
      args: [],
      kwargs: {
        name: params.name || '',
        limit: params.limit || 20,
      },
    });
  }

  async loadAction(actionRef: string): Promise<ActionRecord | null> {
    const match = actionRef.match(/^ir\.actions\.act_window\((\d+)\)$/);
    if (!match) return null;

    const actionId = parseInt(match[1], 10);

    const actions = await jsonRpc<ActionRecord[]>(`${ODOO_BASE_URL}/dataset/call_kw/ir.actions.act_window/read`, 'call', {
      model: 'ir.actions.act_window',
      method: 'read',
      args: [[actionId]],
      kwargs: {
        fields: ['id', 'name', 'type', 'res_model', 'view_mode', 'domain', 'context', 'views'],
      },
    });

    return actions.length > 0 ? actions[0] : null;
  }

  async loadMenus(): Promise<MenuRawRecord[]> {
    const result = await jsonRpc<{ children: Array<{ id: number; name: string; action?: string; web_icon?: string }> }>(
      `${ODOO_BASE_URL}/webclient/load_menus`,
      'call',
      {}
    );

    const menus: MenuRawRecord[] = [];

    const processMenu = (menu: any, parentPath: string = '') => {
      const completeName = parentPath ? `${parentPath} / ${menu.name}` : menu.name;
      menus.push({
        id: menu.id,
        sequence: menu.id,
        complete_name: completeName,
        web_icon: menu.web_icon,
        action: menu.action,
      });

      if (menu.children && menu.children.length > 0) {
        menu.children.forEach((child: any) => processMenu(child, completeName));
      }
    };

    if (result.children) {
      result.children.forEach((menu: any) => processMenu(menu));
    }

    return menus;
  }
}
