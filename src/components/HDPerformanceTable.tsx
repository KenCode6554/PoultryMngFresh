import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';


interface HDDataRow {
  farm_name: string;
  kandang_name: string;
  umur: number;
  // Weeks
  hd_m4: number | null;
  hd_m3: number | null;
  hd_m2: number | null;
  hd_m1: number | null;
  // Days (d7 is 6 days ago, d1 is today, according to layout D-6 to Today?)
  // Let's use d7 to d1 where d1 is the latest day (today), d2 is yesterday, etc.
  hd_d7: number | null; // e.g. HD D-6
  hd_d6: number | null;
  hd_d5: number | null;
  hd_d4: number | null;
  hd_d3: number | null;
  hd_d2: number | null;
  hd_d1: number | null; // e.g. HD D-0 / Today
}

interface HDPerformanceTableProps {
  farms: any[];
}

export function HDPerformanceTable({ farms }: HDPerformanceTableProps) {
  const [data, setData] = useState<HDDataRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [farms]);

  async function fetchData() {
    try {
      setLoading(true);
      // 1. Fetch farms and kandangs
      const { data: kandangData } = await supabase.from('kandang').select('id, name, farms(name)');
      
      if (!kandangData) return;

      const allowedKandangIds = new Set(
        farms.flatMap(f => (f.kandang || []).map((k: any) => k.id))
      );
      const filteredKandangData = kandangData.filter(k => allowedKandangIds.has(k.id));

      const rows: HDDataRow[] = [];

      for (const k of filteredKandangData) {
        const farmName = (k.farms as any)?.name || 'Unknown';
        const kandangName = k.name;

        // Fetch last 4 COMPLETED weeks of weekly production.
        // We exclude the current partial week by requiring week_end_date <= (today - 7 days).
        // This prevents a partially-recorded current week (e.g. only 1-2 days synced) 
        // from appearing as M-1 with an artificially low HD%.
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

        const { data: weeklyData } = await supabase
          .from('weekly_production')
          .select('usia_minggu, hd_actual, week_end_date')
          .eq('kandang_id', k.id)
          .lte('week_end_date', cutoffDate)
          .not('hd_actual', 'is', null)
          .order('week_end_date', { ascending: false })
          .limit(4);

        // Sort ascending for chronological processing (oldest to newest)
        const weeklyChronological = (weeklyData || []).sort((a, b) => new Date(a.week_end_date).getTime() - new Date(b.week_end_date).getTime());

        // Fetch last 7 days of daily production (no cutoff — daily data is always current)
        const { data: dailyData } = await supabase
          .from('daily_production')
          .select('usia_minggu, usia_hari, hd_actual, tanggal')
          .eq('kandang_id', k.id)
          .not('hd_actual', 'is', null)
          .order('tanggal', { ascending: false })
          .limit(7);

        const dailyChronological = (dailyData || []).sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());

        // Latest age (Umur) can be taken from the latest daily data, or weekly if no daily
        let latestAge = 0;
        if (dailyChronological.length > 0) {
          latestAge = dailyChronological[dailyChronological.length - 1].usia_minggu || 0;
        } else if (weeklyChronological.length > 0) {
          latestAge = weeklyChronological[weeklyChronological.length - 1].usia_minggu || 0;
        }

        // Map weekly to M-4, M-3, M-2, M-1
        // If there are less than 4, they fill from M-1 backwards
        const hd_m1 = weeklyChronological.length >= 1 ? weeklyChronological[weeklyChronological.length - 1].hd_actual : null;
        const hd_m2 = weeklyChronological.length >= 2 ? weeklyChronological[weeklyChronological.length - 2].hd_actual : null;
        const hd_m3 = weeklyChronological.length >= 3 ? weeklyChronological[weeklyChronological.length - 3].hd_actual : null;
        const hd_m4 = weeklyChronological.length >= 4 ? weeklyChronological[weeklyChronological.length - 4].hd_actual : null;

        // Map daily to D-7 to D-1 (where D-1 is the latest)
        const hd_d1 = dailyChronological.length >= 1 ? dailyChronological[dailyChronological.length - 1].hd_actual : null;
        const hd_d2 = dailyChronological.length >= 2 ? dailyChronological[dailyChronological.length - 2].hd_actual : null;
        const hd_d3 = dailyChronological.length >= 3 ? dailyChronological[dailyChronological.length - 3].hd_actual : null;
        const hd_d4 = dailyChronological.length >= 4 ? dailyChronological[dailyChronological.length - 4].hd_actual : null;
        const hd_d5 = dailyChronological.length >= 5 ? dailyChronological[dailyChronological.length - 5].hd_actual : null;
        const hd_d6 = dailyChronological.length >= 6 ? dailyChronological[dailyChronological.length - 6].hd_actual : null;
        const hd_d7 = dailyChronological.length >= 7 ? dailyChronological[dailyChronological.length - 7].hd_actual : null;

        rows.push({
          farm_name: farmName.replace('Farm ', '').replace('Kandang ', ''),
          kandang_name: kandangName,
          umur: latestAge,
          hd_m4, hd_m3, hd_m2, hd_m1,
          hd_d7, hd_d6, hd_d5, hd_d4, hd_d3, hd_d2, hd_d1
        });
      }

      // Sort rows by Farm then Kandang
      rows.sort((a, b) => {
        if (a.farm_name < b.farm_name) return -1;
        if (a.farm_name > b.farm_name) return 1;
        return a.kandang_name.localeCompare(b.kandang_name);
      });

      setData(rows);
    } catch (err) {
      console.error('Error fetching HD performance:', err);
    } finally {
      setLoading(false);
    }
  }

  // Helper to render a cell with potential red highlighting if dropped by >= 1% from previous
  const renderCell = (current: number | null, previous: number | null) => {
    if (current == null) return <td style={{ padding: '0.75rem 1rem', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.05)' }}>-</td>;
    
    let isDrop = false;
    if (previous != null && (previous - current) >= 1) {
      isDrop = true;
    }

    return (
      <td style={{ 
        padding: '0.75rem 1rem', 
        textAlign: 'center', 
        borderRight: '1px solid rgba(255,255,255,0.05)',
        color: isDrop ? 'rgb(239, 68, 68)' : 'inherit',
        fontWeight: isDrop ? 700 : 400
      }}>
        {Number(current).toFixed(1)}%
      </td>
    );
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading HD Performance Data...</div>;
  }

  return (
    <div className="card" style={{ marginTop: '2rem', overflowX: 'auto' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>HD Performance History</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: '0.25rem 0 0 0' }}>
          Overview of Hen Day production (weekly and daily). Values dropping ≥ 1% from the previous period are highlighted in red.
        </p>
      </div>
      
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
            <th rowSpan={2} style={{ padding: '0.75rem 1rem', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.05)' }}>Farm</th>
            <th rowSpan={2} style={{ padding: '0.75rem 1rem', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.05)' }}>Kandang</th>
            <th rowSpan={2} style={{ padding: '0.75rem 1rem', textAlign: 'center', borderRight: '1px solid var(--border)' }}>Umur (Mg)</th>
            <th colSpan={4} style={{ padding: '0.75rem 1rem', textAlign: 'center', borderRight: '1px solid var(--border)' }}>Henday 4 pekan sebelumnya</th>
            <th colSpan={7} style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Produksi telur pekan berjalan</th>
          </tr>
          <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 500, color: 'var(--muted-foreground)' }}>HD M-4</th>
            <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 500, color: 'var(--muted-foreground)' }}>HD M-3</th>
            <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 500, color: 'var(--muted-foreground)' }}>HD M-2</th>
            <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 500, color: 'var(--muted-foreground)', borderRight: '1px solid var(--border)' }}>HD M-1</th>
            <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 500, color: 'var(--muted-foreground)' }}>HD D-6</th>
            <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 500, color: 'var(--muted-foreground)' }}>HD D-5</th>
            <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 500, color: 'var(--muted-foreground)' }}>HD D-4</th>
            <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 500, color: 'var(--muted-foreground)' }}>HD D-3</th>
            <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 500, color: 'var(--muted-foreground)' }}>HD D-2</th>
            <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 500, color: 'var(--muted-foreground)' }}>HD D-1</th>
            <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 500, color: 'var(--muted-foreground)' }}>HD Today</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            // Group logic for Farm cell could be added here, but printing it per row is fine too
            const isNewFarm = idx === 0 || data[idx - 1].farm_name !== row.farm_name;

            return (
              <tr key={`${row.farm_name}-${row.kandang_name}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: isNewFarm ? 700 : 400, borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                  {isNewFarm ? row.farm_name : ''}
                </td>
                <td style={{ padding: '0.75rem 1rem', borderRight: '1px solid rgba(255,255,255,0.05)' }}>{row.kandang_name}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'center', borderRight: '1px solid var(--border)' }}>{row.umur || '-'}</td>
                
                {/* Weekly */}
                {renderCell(row.hd_m4, null)}
                {renderCell(row.hd_m3, row.hd_m4)}
                {renderCell(row.hd_m2, row.hd_m3)}
                {renderCell(row.hd_m1, row.hd_m2)}

                {/* Daily */}
                {renderCell(row.hd_d7, row.hd_m1)} {/* Compare first day with M-1? User said M-1 drop is red */}
                {renderCell(row.hd_d6, row.hd_d7)}
                {renderCell(row.hd_d5, row.hd_d6)}
                {renderCell(row.hd_d4, row.hd_d5)}
                {renderCell(row.hd_d3, row.hd_d4)}
                {renderCell(row.hd_d2, row.hd_d3)}
                {renderCell(row.hd_d1, row.hd_d2)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
