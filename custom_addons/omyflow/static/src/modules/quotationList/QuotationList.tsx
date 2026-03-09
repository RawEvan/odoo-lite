import React, { useState, useEffect, useCallback } from 'react';
import { OdooService } from '../../services/odoo';
import './QuotationList.css';

interface QuotationRecord {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  date_order: string;
  amount_total: number;
  state: string;
}

interface QuotationListProps {
  model: string;
  recordId: number | null;
  params: Record<string, string>;
  onOpenRecord: (model: string, recordId: number, title: string) => void;
}

const STATE_COLORS: Record<string, string> = {
  draft: '#999',
  sent: '#714B67',
  sale: '#2E7D32',
  done: '#0066CC',
  cancel: '#dc3545',
};

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

export const QuotationList: React.FC<QuotationListProps> = ({ model, onOpenRecord }) => {
  const [records, setRecords] = useState<QuotationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const odoo = OdooService.getInstance();
      const result = await odoo.webSearchRead<QuotationRecord>({
        model,
        fields: ['name', 'partner_id', 'date_order', 'amount_total', 'state'],
        limit,
        offset,
        order: 'date_order desc',
      });
      setRecords(result.records);
      setTotal(result.length);
    } catch (error) {
      console.error('Failed to load quotations:', error);
    } finally {
      setLoading(false);
    }
  }, [model, offset]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleRowClick = (record: QuotationRecord) => {
    const title = record.name || `Quotation #${record.id}`;
    onOpenRecord(model, record.id, title);
  };

  const handlePrevPage = () => {
    setOffset(Math.max(0, offset - limit));
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset(offset + limit);
    }
  };

  if (loading) {
    return <div className="quotation-list__loading">Loading...</div>;
  }

  return (
    <div className="quotation-list">
      <div className="quotation-list__header">
        <h3>Quotations</h3>
        <span className="quotation-list__count">{total} records</span>
      </div>

      <div className="quotation-list__table-wrapper">
        <table className="quotation-list__table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map(record => (
              <tr
                key={record.id}
                className="quotation-list__row"
                onClick={() => handleRowClick(record)}
              >
                <td className="quotation-list__number">{record.name}</td>
                <td>{record.partner_id ? record.partner_id[1] : '-'}</td>
                <td>{formatDate(record.date_order)}</td>
                <td className="quotation-list__amount">{formatCurrency(record.amount_total)}</td>
                <td>
                  <span
                    className="quotation-list__state"
                    style={{ backgroundColor: STATE_COLORS[record.state] || '#999' }}
                  >
                    {STATE_LABELS[record.state] || record.state}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="quotation-list__pagination">
        <button
          onClick={handlePrevPage}
          disabled={offset === 0}
        >
          Previous
        </button>
        <span>
          {offset + 1} - {Math.min(offset + limit, total)} of {total}
        </span>
        <button
          onClick={handleNextPage}
          disabled={offset + limit >= total}
        >
          Next
        </button>
      </div>
    </div>
  );
};
