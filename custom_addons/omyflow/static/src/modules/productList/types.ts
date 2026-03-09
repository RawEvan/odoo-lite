export interface ProductData {
  id: number;
  name: string;
  default_code: string;
  list_price: number;
  qty_available: number;
  categ_id: [number, string] | false;
  description: string;
}
