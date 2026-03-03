import React, { useState, useEffect, useCallback } from 'react';
import { OdooService } from '../../services/odoo';
import './ProductList.css';

interface ProductRecord {
  id: number;
  name: string;
  default_code: string;
  list_price: number;
  qty_available: number;
  categ_id: [number, string] | false;
}

interface ProductListProps {
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

export const ProductList: React.FC<ProductListProps> = ({ model, onOpenRecord }) => {
  const [records, setRecords] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const odoo = OdooService.getInstance();
      const result = await odoo.webSearchRead<ProductRecord>({
        model,
        fields: ['name', 'default_code', 'list_price', 'qty_available', 'categ_id'],
        limit,
        offset,
        order: 'name',
      });
      setRecords(result.records);
      setTotal(result.length);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setLoading(false);
    }
  }, [model, offset]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleRowClick = (record: ProductRecord) => {
    onOpenRecord(model, record.id, record.name);
  };

  if (loading) {
    return <div className="product-list__loading">Loading...</div>;
  }

  return (
    <div className="product-list">
      <div className="product-list__header">
        <h3>Products</h3>
        <span className="product-list__count">{total} records</span>
      </div>

      <div className="product-list__table-wrapper">
        <table className="product-list__table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {records.map(record => (
              <tr
                key={record.id}
                className="product-list__row"
                onClick={() => handleRowClick(record)}
              >
                <td className="product-list__code">{record.default_code || '-'}</td>
                <td>{record.name}</td>
                <td>{record.categ_id ? record.categ_id[1] : '-'}</td>
                <td className="product-list__price">{formatCurrency(record.list_price)}</td>
                <td className="product-list__qty">{record.qty_available}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="product-list__pagination">
        <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>
          Previous
        </button>
        <span>{offset + 1} - {Math.min(offset + limit, total)} of {total}</span>
        <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}>
          Next
        </button>
      </div>
    </div>
  );
};
