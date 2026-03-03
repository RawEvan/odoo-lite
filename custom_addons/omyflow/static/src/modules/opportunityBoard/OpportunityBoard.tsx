import React, { useState, useEffect, useCallback } from 'react';
import { OdooService } from '../../services/odoo';

interface LeadRecord {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  stage_id: [number, string] | false;
  probability: number;
  expected_revenue: number;
}

interface OpportunityBoardProps {
  model: string;
  recordId: number | null;
  params: Record<string, string>;
  onOpenRecord: (model: string, recordId: number, title: string) => void;
}

const STAGE_COLORS: Record<string, string> = {
  'New': '#999',
  'Qualified': '#714B67',
  'Proposition': '#0066CC',
  'Won': '#2E7D32',
  'Lost': '#dc3545',
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const OpportunityBoard: React.FC<OpportunityBoardProps> = ({
  model,
  onOpenRecord,
}) => {
  const [records, setRecords] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const odoo = OdooService.getInstance();
      const result = await odoo.webSearchRead<LeadRecord>({
        model,
        fields: ['name', 'partner_id', 'stage_id', 'probability', 'expected_revenue'],
        limit: 50,
        order: 'priority desc, date_deadline',
      });
      setRecords(result.records);
    } catch (error) {
      console.error('Failed to load opportunities:', error);
    } finally {
      setLoading(false);
    }
  }, [model]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  if (loading) {
    return <div style={{ padding: 16, textAlign: 'center' }}>Loading...</div>;
  }

  const stages = ['New', 'Qualified', 'Proposition', 'Won'];
  const groupedRecords = stages.reduce((acc, stage) => {
    acc[stage] = records.filter(r => r.stage_id && r.stage_id[1] === stage);
    return acc;
  }, {} as Record<string, LeadRecord[]>);

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <h3 style={{ margin: '0 0 16px 0' }}>Opportunities</h3>
      <div style={{ display: 'flex', gap: 16, minHeight: '100%' }}>
        {stages.map(stage => (
          <div
            key={stage}
            style={{
              flex: 1,
              minWidth: 200,
              background: '#f5f5f5',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              <span style={{
                fontWeight: 500,
                fontSize: '0.875rem',
              }}>
                {stage}
              </span>
              <span style={{
                background: STAGE_COLORS[stage] || '#999',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: '0.75rem',
              }}>
                {groupedRecords[stage]?.length || 0}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groupedRecords[stage]?.map(record => (
                <div
                  key={record.id}
                  onClick={() => onOpenRecord(model, record.id, record.name)}
                  style={{
                    background: '#fff',
                    borderRadius: 6,
                    padding: 12,
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: 4 }}>
                    {record.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: 4 }}>
                    {record.partner_id ? record.partner_id[1] : '-'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span>{formatCurrency(record.expected_revenue)}</span>
                    <span>{record.probability}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
