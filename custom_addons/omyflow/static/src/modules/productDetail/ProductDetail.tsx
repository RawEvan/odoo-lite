import React, { useState, useEffect, useCallback } from 'react';
import { OdooService } from '../../services/odoo';
import './ProductDetail.css';

interface ProductData {
  id: number;
  name: string;
  default_code: string;
  list_price: number;
  qty_available: number;
  categ_id: [number, string] | false;
  description: string;
}

interface ProductDetailProps {
  model: string;
  recordId: number | null;
  params: Record<string, string>;
  onOpenRecord: (model: string, recordId: number, title: string) => void;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export const ProductDetailComponent: React.FC<ProductDetailProps> = ({
  model,
  recordId,
}) => {
  const [data, setData] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!recordId) return;

    setLoading(true);
    try {
      const odoo = OdooService.getInstance();
      const records = await odoo.webRead<ProductData>({
        model,
        ids: [recordId],
        fields: ['name', 'default_code', 'list_price', 'qty_available', 'categ_id', 'description'],
      });

      if (records.length > 0) {
        setData(records[0]);
      }
    } catch (error) {
      console.error('Failed to load product:', error);
    } finally {
      setLoading(false);
    }
  }, [model, recordId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <div className="product-detail__loading">Loading...</div>;
  }

  if (!data) {
    return <div className="product-detail__error">Product not found</div>;
  }

  return (
    <div className="product-detail">
      <div className="product-detail__header">
        <h3>{data.name}</h3>
        {data.default_code && (
          <span className="product-detail__code">{data.default_code}</span>
        )}
      </div>

      <div className="product-detail__body">
        <div className="product-detail__info-grid">
          <div className="product-detail__info-item">
            <label>Category</label>
            <span>{data.categ_id ? data.categ_id[1] : '-'}</span>
          </div>
          <div className="product-detail__info-item">
            <label>Price</label>
            <span className="product-detail__price">{formatCurrency(data.list_price)}</span>
          </div>
          <div className="product-detail__info-item">
            <label>Quantity On Hand</label>
            <span className="product-detail__qty">{data.qty_available}</span>
          </div>
        </div>

        {data.description && (
          <div className="product-detail__section">
            <h4>Description</h4>
            <p className="product-detail__description">{data.description}</p>
          </div>
        )}
      </div>
    </div>
  );
};
