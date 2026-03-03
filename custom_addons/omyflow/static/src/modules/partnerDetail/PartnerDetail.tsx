import React, { useState, useEffect, useCallback } from 'react';
import { OdooService } from '../../services/odoo';

interface PartnerData {
  id: number;
  name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  zip: string;
  country_id: [number, string] | false;
  is_company: boolean;
}

interface PartnerDetailProps {
  model: string;
  recordId: number | null;
  params: Record<string, string>;
  onOpenRecord: (model: string, recordId: number, title: string) => void;
}

export const PartnerDetailComponent: React.FC<PartnerDetailProps> = ({
  model,
  recordId,
}) => {
  const [data, setData] = useState<PartnerData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!recordId) return;

    setLoading(true);
    try {
      const odoo = OdooService.getInstance();
      const records = await odoo.webRead<PartnerData>({
        model,
        ids: [recordId],
        fields: ['name', 'email', 'phone', 'street', 'city', 'zip', 'country_id', 'is_company'],
      });

      if (records.length > 0) {
        setData(records[0]);
      }
    } catch (error) {
      console.error('Failed to load partner:', error);
    } finally {
      setLoading(false);
    }
  }, [model, recordId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <div style={{ padding: 16, textAlign: 'center' }}>Loading...</div>;
  }

  if (!data) {
    return <div style={{ padding: 16, textAlign: 'center' }}>Partner not found</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 8px 0' }}>{data.name}</h3>
        <span style={{
          display: 'inline-block',
          padding: '2px 8px',
          fontSize: '0.75rem',
          background: data.is_company ? '#e3f2fd' : '#f5f5f5',
          color: data.is_company ? '#1976d2' : '#666',
          borderRadius: 4,
        }}>
          {data.is_company ? 'Company' : 'Individual'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: 4 }}>Email</label>
          <span style={{ fontSize: '0.875rem' }}>{data.email || '-'}</span>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: 4 }}>Phone</label>
          <span style={{ fontSize: '0.875rem' }}>{data.phone || '-'}</span>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: 4 }}>Address</label>
          <span style={{ fontSize: '0.875rem' }}>
            {[data.street, data.city, data.zip, data.country_id?.[1]].filter(Boolean).join(', ') || '-'}
          </span>
        </div>
      </div>
    </div>
  );
};
