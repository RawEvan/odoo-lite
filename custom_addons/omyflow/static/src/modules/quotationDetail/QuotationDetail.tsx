import React, { useState, useEffect, useCallback } from 'react';
import { OdooService } from '../../services/odoo';
import './QuotationDetail.css';

interface QuotationLine {
  id: number;
  product_id: [number, string] | false;
  name: string;
  product_uom_qty: number;
  price_unit: number;
  price_subtotal: number;
}

interface QuotationData {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  date_order: string;
  amount_total: number;
  amount_untaxed: number;
  state: string;
  note: string;
  order_line: number[];
}

interface QuotationDetailProps {
  model: string;
  recordId: number | null;
  params: Record<string, string>;
  onOpenRecord: (model: string, recordId: number, title: string) => void;
}

const STATE_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  sale: 'Sale Order',
  done: 'Done',
  cancel: 'Cancelled',
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString();
};

export const QuotationDetailComponent: React.FC<QuotationDetailProps> = ({
  model,
  recordId,
  onOpenRecord,
}) => {
  const [data, setData] = useState<QuotationData | null>(null);
  const [lines, setLines] = useState<QuotationLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);

  const loadData = useCallback(async () => {
    if (!recordId) return;

    setLoading(true);
    try {
      const odoo = OdooService.getInstance();
      const records = await odoo.webRead<QuotationData>({
        model,
        ids: [recordId],
        fields: ['name', 'partner_id', 'date_order', 'amount_total', 'amount_untaxed', 'state', 'note', 'order_line'],
      });

      if (records.length > 0) {
        setData(records[0]);

        if (records[0].order_line && records[0].order_line.length > 0) {
          const lineRecords = await odoo.webRead<QuotationLine>({
            model: 'sale.order.line',
            ids: records[0].order_line,
            fields: ['product_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal'],
          });
          setLines(lineRecords);
        }
      }
    } catch (error) {
      console.error('Failed to load quotation:', error);
    } finally {
      setLoading(false);
    }
  }, [model, recordId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePartnerClick = () => {
    if (data?.partner_id) {
      onOpenRecord('res.partner', data.partner_id[0], data.partner_id[1]);
    }
  };

  if (loading) {
    return <div className="quotation-detail__loading">Loading...</div>;
  }

  if (!data) {
    return <div className="quotation-detail__error">Quotation not found</div>;
  }

  const isEditable = data.state === 'draft' || data.state === 'sent';

  return (
    <div className={`quotation-detail ${editMode ? 'quotation-detail--edit-mode' : ''}`}>
      <div className="quotation-detail__header">
        <div className="quotation-detail__title-row">
          <h3>{data.name}</h3>
          <button
            className={`quotation-detail__edit-toggle ${editMode ? '--active' : ''}`}
            onClick={() => setEditMode(!editMode)}
            disabled={!isEditable}
          >
            ✏️ {editMode && <span>Save</span>}
          </button>
        </div>
        <span className={`quotation-detail__state quotation-detail__state--${data.state}`}>
          {STATE_LABELS[data.state] || data.state}
        </span>
      </div>

      <div className="quotation-detail__body">
        <div className="quotation-detail__info-grid">
          <div className="quotation-detail__info-item">
            <label>Customer</label>
            {data.partner_id ? (
              <span
                className="quotation-detail__link"
                onClick={handlePartnerClick}
              >
                {data.partner_id[1]}
              </span>
            ) : (
              <span>-</span>
            )}
          </div>
          <div className="quotation-detail__info-item">
            <label>Date</label>
            <span>{formatDate(data.date_order)}</span>
          </div>
          <div className="quotation-detail__info-item">
            <label>Untaxed Amount</label>
            <span className="quotation-detail__amount">{formatCurrency(data.amount_untaxed)}</span>
          </div>
          <div className="quotation-detail__info-item">
            <label>Total</label>
            <span className="quotation-detail__amount quotation-detail__amount--total">
              {formatCurrency(data.amount_total)}
            </span>
          </div>
        </div>

        <div className="quotation-detail__section">
          <h4>Order Lines</h4>
          <table className="quotation-detail__table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(line => (
                <tr key={line.id}>
                  <td>{line.product_id ? line.product_id[1] : line.name}</td>
                  <td className="quotation-detail__number">{line.product_uom_qty}</td>
                  <td className="quotation-detail__number">{formatCurrency(line.price_unit)}</td>
                  <td className="quotation-detail__number">{formatCurrency(line.price_subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.note && (
          <div className="quotation-detail__section">
            <h4>Notes</h4>
            <p className="quotation-detail__note">{data.note}</p>
          </div>
        )}
      </div>
    </div>
  );
};
