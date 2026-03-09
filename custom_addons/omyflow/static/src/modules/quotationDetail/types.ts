export interface QuotationData {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  date_order: string;
  amount_total: number;
  amount_untaxed: number;
  state: string;
}

export interface QuotationLine {
  id: number;
  product_id: [number, string] | false;
  name: string;
  product_uom_qty: number;
  price_unit: number;
  price_subtotal: number;
}
