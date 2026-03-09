import { ModelPageConfig } from '../pageManager/types';
import { QuotationList } from '../quotationList/QuotationList';
import { QuotationDetailComponent } from '../quotationDetail/QuotationDetail';
import { ProductList } from '../productList/ProductList';
import { ProductDetailComponent } from '../productDetail/ProductDetail';
import { PartnerDetailComponent } from '../partnerDetail/PartnerDetail';
import { OpportunityBoard } from '../opportunityBoard/OpportunityBoard';

export const MODEL_PAGES: Record<string, ModelPageConfig> = {
  'sale.order': {
    listComponent: QuotationList,
    formComponent: QuotationDetailComponent,
    defaultView: 'list',
  },
  'product.product': {
    listComponent: ProductList,
    formComponent: ProductDetailComponent,
    defaultView: 'list',
  },
  'product.template': {
    listComponent: ProductList,
    formComponent: ProductDetailComponent,
    defaultView: 'list',
  },
  'res.partner': {
    formComponent: PartnerDetailComponent,
    defaultView: 'form',
  },
  'crm.lead': {
    kanbanComponent: OpportunityBoard,
    defaultView: 'kanban',
  },
};

export function hasModelPage(model: string): boolean {
  return model in MODEL_PAGES;
}

export function getModelPageConfig(model: string): ModelPageConfig | undefined {
  return MODEL_PAGES[model];
}
