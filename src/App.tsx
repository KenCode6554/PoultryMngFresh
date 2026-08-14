import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { ChatPanel } from './components/ChatPanel';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { ComparisonPanel } from './components/ComparisonPanel';
import { Login } from './components/Login';
import { SopTracker } from './components/SopTracker';
import { HDPerformanceTable } from './components/HDPerformanceTable';

import {
  BarChart3,
  AlertTriangle,
  TrendingUp,
  Activity,
  Layers,

  MessageSquare,
  ChevronDown,
  TrendingDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Columns2,
  ClipboardCheck
} from 'lucide-react';

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';


interface Stats {
  totalPopulation: number;
  bbkPopulation: number;
  jtpPopulation: number;
  avgHD: number;
  hdTrend: number;
  criticalGaps: number;
  activeFarms: number;
}

interface ComputedGap {
  kandang_id: string;
  kandang_name: string;
  farm_name: string;
  farm_id: string;
  comparison_mode: 'actual_vs_std' | 'actual_vs_actual';
  week_date: string | null;
  week_from: string | null;
  week_to: string | null;
  usia_minggu: number | null;
  usia_from: number | null;
  usia_to: number | null;
  variable: string;
  actual_value: number;
  reference_value: number;
  change_value: number;
  change_pct: number;
  direction: string;
  health_signal: 'GOOD' | 'BAD' | 'WATCH';
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'farms' | 'gaps' | 'analytics' | 'comparison' | 'ai' | 'sop'>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [stats, setStats] = useState<Stats>({
    totalPopulation: 0,
    bbkPopulation: 0,
    jtpPopulation: 0,
    avgHD: 0,
    hdTrend: 0,
    criticalGaps: 0,
    activeFarms: 0
  });
  const [, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartDataEgg, setChartDataEgg] = useState<any[]>([]);
  const [chartDataFCR, setChartDataFCR] = useState<any[]>([]);
  const [chartDataFeed, setChartDataFeed] = useState<any[]>([]);
  const [chartDataDeplesi, setChartDataDeplesi] = useState<any[]>([]);
  const [gaps, setGaps] = useState<ComputedGap[]>([]);
  const [farms, setFarms] = useState<any[]>([]);
  const [overviewFarms, setOverviewFarms] = useState<string[]>(['BBK', 'JTP']);
  
  // Gap Warnings Filters
  const [gapFilterFarm, setGapFilterFarm] = useState<string | null>(null);
  const [gapFilterKandang, setGapFilterKandang] = useState<string | null>(null);
  const [gapFilterVariable, setGapFilterVariable] = useState<string | null>(null);
  const [gapFilterType, setGapFilterType] = useState<'all' | 'std' | 'actual'>('all');

  // Analytics deep-link state
  const [analyticsFarmId, setAnalyticsFarmId] = useState<string | null>(null);
  const [analyticsKandangId, setAnalyticsKandangId] = useState<string | null>(null);

  function navigateToAnalytics(farmId: string, kandangId: string) {
    setAnalyticsFarmId(farmId);
    setAnalyticsKandangId(kandangId);
    setActiveTab('analytics');
  }
  

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    fetchDashboardData();

    return () => subscription.unsubscribe();
  }, []);

  // ─── Gap Engine (TypeScript port of gap_engine.py) ─────────────────────────
  const THRESHOLD = 2.0;

  const HEALTH_SIGNALS: Record<string, Record<string, 'GOOD' | 'BAD' | 'WATCH'>> = {
    hd_pct:      { INCREASING: 'GOOD',  DECREASING: 'BAD' },
    egg_mass:    { INCREASING: 'GOOD',  DECREASING: 'BAD' },
    egg_weight:  { INCREASING: 'GOOD',  DECREASING: 'BAD' },
    pakan:       { INCREASING: 'WATCH', DECREASING: 'GOOD' },
    fcr:         { INCREASING: 'BAD',   DECREASING: 'GOOD' },
    deplesi_pct: { INCREASING: 'BAD',   DECREASING: 'GOOD' },
  };

  function generateGapsFromProduction(records: any[]): ComputedGap[] {
    const computed: ComputedGap[] = [];

    // Sort by kandang_id then usia_minggu to enable week-over-week comparison
    const sorted = [...records].sort((a, b) => {
      if (a.kandang_id < b.kandang_id) return -1;
      if (a.kandang_id > b.kandang_id) return 1;
      return (a.usia_minggu ?? 0) - (b.usia_minggu ?? 0);
    });

    for (let i = 0; i < sorted.length; i++) {
      const rec = sorted[i];
      const kandangId = rec.kandang_id;
      const kandangName = rec.kandang?.name ?? '-';
      const farmName = rec.kandang?.farms?.name ?? '-';
      const farmId = rec.kandang?.farms?.id ?? '';
      const weekDate = rec.week_end_date ?? null;
      const usia = rec.usia_minggu ?? null;

      const base = { kandang_id: kandangId, kandang_name: kandangName, farm_name: farmName, farm_id: farmId };

      // ── Mode 1: Actual vs STD / Cumulative ───────────────────────────────────
      const stdVars: [string, string, string][] = [
        ['hd_pct',     'hd_actual',          'hd_std'],
        ['egg_weight', 'egg_weight_actual',   'egg_weight_std'],
        ['pakan',      'pakan_g_per_ekor_hr', 'pakan_std'],
        ['fcr',        'fcr_actual',          'fcr_cum'],   // compare against cumulative FCR (same as chart)
      ];

      for (const [varName, actKey, stdKey] of stdVars) {
        const actual = rec[actKey];
        const std    = rec[stdKey];
        if (actual == null || std == null || Number(std) === 0) continue;
        if (Number(actual) === 0) continue;

        const gapValue = Number(actual) - Number(std);
        const gapPct   = (Math.abs(gapValue) / Math.abs(Number(std))) * 100;
        if (gapPct < THRESHOLD) continue;

        const direction = gapValue > 0 ? 'ABOVE STANDARD' : 'BELOW STANDARD';
        let health: 'GOOD' | 'BAD' | 'WATCH' = 'GOOD';
        if (['hd_pct', 'egg_weight'].includes(varName) && gapValue < 0) health = 'BAD';
        else if (varName === 'pakan' && gapValue > 0) health = 'WATCH';
        else if (varName === 'fcr' && gapValue > 0) health = 'BAD';
        // Skip GOOD-signal deviations — only surface BAD and WATCH (matches Python gap_engine.py)
        if (health === 'GOOD') continue;

        computed.push({
          ...base,
          comparison_mode: 'actual_vs_std',
          week_date: weekDate, week_from: null, week_to: null,
          usia_minggu: usia, usia_from: null, usia_to: null,
          variable: varName,
          actual_value: Number(actual),
          reference_value: Number(std),
          change_value: gapValue,
          change_pct: gapPct,
          direction,
          health_signal: health,
        });
      }

      // ── Mode 2: Actual vs Actual (week-over-week) ────────────────────────────
      // Find the previous week record for the same kandang
      if (i > 0 && sorted[i - 1].kandang_id === kandangId) {
        const prev = sorted[i - 1];
        const weekFrom = prev.week_end_date ?? null;
        const usiaFrom = prev.usia_minggu ?? null;

        const avaVars: [string, string][] = [
          ['hd_pct',     'hd_actual'],
          ['egg_weight', 'egg_weight_actual'],
          ['pakan',      'pakan_g_per_ekor_hr'],
          ['fcr',        'fcr_actual'],
          ['deplesi_pct','deplesi_pct'],
        ];

        for (const [varName, actKey] of avaVars) {
          const valPrev = prev[actKey];
          const valCurr = rec[actKey];
          if (valPrev == null || valCurr == null) continue;
          if (Number(valCurr) === 0) continue;

          const changeValue = Number(valCurr) - Number(valPrev);
          if (Number(valPrev) === 0) continue;
          const changePct = (Math.abs(changeValue) / Math.abs(Number(valPrev))) * 100;
          if (changePct < THRESHOLD) continue;

          const direction = changeValue > 0 ? 'INCREASING' : 'DECREASING';
          const health = (HEALTH_SIGNALS[varName]?.[direction] ?? 'WATCH');
          // Skip GOOD-signal deviations — only surface BAD and WATCH
          if (health === 'GOOD') continue;

          computed.push({
            ...base,
            comparison_mode: 'actual_vs_actual',
            week_date: weekDate, week_from: weekFrom, week_to: weekDate,
            usia_minggu: usia, usia_from: usiaFrom, usia_to: usia,
            variable: varName,
            actual_value: Number(valCurr),
            reference_value: Number(valPrev),
            change_value: changeValue,
            change_pct: changePct,
            direction,
            health_signal: health,
          });
        }
      }
    }

    // Sort newest first
    return computed.sort((a, b) => {
      const da = a.week_date ?? a.week_to ?? '';
      const db = b.week_date ?? b.week_to ?? '';
      return db.localeCompare(da);
    });
  }

  function generateAllOverviewCharts(production: any[]) {
    // Single-pass aggregation — groups all 5 metrics by usia_minggu per farm
    type FarmWeekStats = { sum: number; count: number };
    const metrics = ['hd', 'egg', 'fcr', 'feed', 'deplesi'] as const;
    type Metric = typeof metrics[number];
    const byWeek: Record<number, Record<string, Record<Metric, FarmWeekStats>>> = {};

    production.forEach(row => {
      const week = row.usia_minggu;
      if (week == null) return;

      const kandang = row.kandang;
      if (!kandang) return;
      const f = kandang.farms;
      if (!f) return;
      const rawFarmName = (Array.isArray(f) ? f[0]?.name : f.name) || '';

      let farmName = '';
      if (rawFarmName.toUpperCase().includes('BBK')) farmName = 'BBK';
      else if (rawFarmName.toUpperCase().includes('JTP')) farmName = 'JTP';
      if (!farmName) return;

      if (!byWeek[week]) byWeek[week] = {};
      if (!byWeek[week][farmName]) {
        byWeek[week][farmName] = {
          hd: { sum: 0, count: 0 },
          egg: { sum: 0, count: 0 },
          fcr: { sum: 0, count: 0 },
          feed: { sum: 0, count: 0 },
          deplesi: { sum: 0, count: 0 },
        };
      }

      const s = byWeek[week][farmName];
      // HD%
      if (row.hd_actual != null && row.hd_actual !== 0)   { s.hd.sum += row.hd_actual; s.hd.count++; }
      // Egg weight g/btr — stored directly as g/btr (e.g. 44.0g), no conversion needed
      if (row.egg_weight_actual != null && row.egg_weight_actual !== 0) { s.egg.sum += row.egg_weight_actual; s.egg.count++; }
      // FCR
      if (row.fcr_actual != null && row.fcr_actual !== 0)  { s.fcr.sum += row.fcr_actual; s.fcr.count++; }
      // Feed intake (g/bird/day)
      if (row.pakan_g_per_ekor_hr != null && row.pakan_g_per_ekor_hr !== 0) { s.feed.sum += row.pakan_g_per_ekor_hr; s.feed.count++; }
      // Deplesi %
      if (row.deplesi_pct != null)  { s.deplesi.sum += row.deplesi_pct; s.deplesi.count++; }
    });

    const sortedWeeks = Object.entries(byWeek)
      .map(([wk, farms]) => ({ weekNum: Number(wk), farms }))
      .sort((a, b) => a.weekNum - b.weekNum);

    function buildSeries(metric: Metric, decimals = 2) {
      return sortedWeeks.map(({ weekNum, farms }) => {
        const entry: any = { week: `Wk ${weekNum}` };
        for (const farm of ['BBK', 'JTP'] as const) {
          const s = farms[farm]?.[metric];
          if (s && s.count > 0) entry[farm] = Number((s.sum / s.count).toFixed(decimals));
        }
        return entry;
      });
    }

    return {
      hd: buildSeries('hd', 2),
      egg: buildSeries('egg', 1),
      fcr: buildSeries('fcr', 3),
      feed: buildSeries('feed', 1),
      deplesi: buildSeries('deplesi', 3),
    };
  }
  // ─── End Gap Engine ─────────────────────────────────────────────────────────

  async function fetchDashboardData() {
    setLoading(true);
    try {
      // 1. Fetch Weekly Production (with kandang + farm context for gap engine)
      // Paginated fetch to bypass Supabase server-side max_rows=1000 cap
      // .limit(5000) alone doesn't work — must use .range() pagination
      let allProduction: any[] = [];
      let from = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const { data: page, error: pageErr } = await supabase
          .from('weekly_production')
          .select('*, kandang(id, name, populasi, farms(id, name))')
          .order('week_end_date', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (pageErr) throw pageErr;
        if (!page || page.length === 0) break;
        allProduction = allProduction.concat(page);
        if (page.length < PAGE_SIZE) break; // last page
        from += PAGE_SIZE;
      }
      // Customization: Filter down to top 2 units per farm based on average HD%
      let filteredFarmData: any[] = [];
      let production = allProduction;

      // 2. Fetch Farms
      const { data: farmData } = await supabase
        .from('farms')
        .select('*, kandang(*)');

      if (allProduction && farmData) {
        // Calculate average HD% for each kandang
        const kandangHdSum: Record<string, number> = {};
        const kandangHdCount: Record<string, number> = {};
        allProduction.forEach(r => {
          if (r.kandang_id && r.hd_actual != null && r.hd_actual !== 0) {
            kandangHdSum[r.kandang_id] = (kandangHdSum[r.kandang_id] || 0) + Number(r.hd_actual);
            kandangHdCount[r.kandang_id] = (kandangHdCount[r.kandang_id] || 0) + 1;
          }
        });

        const kandangAvgHd: Record<string, number> = {};
        Object.keys(kandangHdSum).forEach(kid => {
          kandangAvgHd[kid] = kandangHdSum[kid] / kandangHdCount[kid];
        });

        // Filter farms to only keep top 2 kandangs
        filteredFarmData = farmData.map(farm => {
          const sortedKandangs = [...(farm.kandang || [])].sort((a, b) => {
            const avgA = kandangAvgHd[a.id] || 0;
            const avgB = kandangAvgHd[b.id] || 0;
            return avgB - avgA;
          });
          return {
            ...farm,
            kandang: sortedKandangs.slice(0, 2)
          };
        });

        // Get allowed kandang IDs
        const allowedKandangIds = new Set<string>();
        filteredFarmData.forEach(farm => {
          farm.kandang?.forEach((k: any) => {
            allowedKandangIds.add(k.id);
          });
        });

        // Filter production records to only allowed ones
        production = allProduction.filter(row => allowedKandangIds.has(row.kandang_id));
      }

      if (production) {
        // Single-pass aggregation for all 5 chart metrics
        const allCharts = generateAllOverviewCharts(production);
        const aggregatedChartData = allCharts.hd;
        
        // Calculate Avg HD: population-weighted across all kandang in latest + prev week
        function weightedHD(rows: any[]) {
          let weightedSum = 0, totalPop = 0;
          rows.forEach(r => {
            const pop = r.kandang?.populasi || 1;
            if (r.hd_actual != null && r.hd_actual !== 0) {
              weightedSum += r.hd_actual * pop;
              totalPop += pop;
            }
          });
          return totalPop > 0 ? weightedSum / totalPop : 0;
        }

        // Extract the absolute latest and previous row for EACH active kandang
        const kandangLatest = new Map();
        const kandangPrev = new Map();
        
        // Filter out future/empty rows so we only look at actual production data
        const validProd = production.filter(r => r.hd_actual != null);

        // Sort chronologically to safely grab the last two ACTIVE records per kandang
        const sortedProd = [...validProd].sort((a, b) => new Date(a.week_end_date).getTime() - new Date(b.week_end_date).getTime());
        sortedProd.forEach(r => {
          kandangPrev.set(r.kandang_id, kandangLatest.get(r.kandang_id));
          kandangLatest.set(r.kandang_id, r);
        });

        const latestRows = Array.from(kandangLatest.values()).filter(Boolean);
        const prevRows = Array.from(kandangPrev.values()).filter(Boolean);

        const latestAvgHd = weightedHD(latestRows);
        const prevAvgHd   = weightedHD(prevRows);
        const hdTrend     = prevAvgHd !== 0 ? Number(((latestAvgHd - prevAvgHd) / prevAvgHd * 100).toFixed(2)) : 0;

        // Compute gaps from production data
        const computedGaps = generateGapsFromProduction(production);
        const criticalCount = computedGaps.filter(g => g.health_signal === 'BAD' || g.health_signal === 'WATCH').length;

        // Calculate Populations
        const populations = { bbk: 0, jtp: 0 };
        filteredFarmData.forEach(farm => {
          const farmPop = farm.kandang?.reduce((sum: number, k: any) => sum + (k.populasi || 0), 0) || 0;
          if (farm.name.includes('BBK')) populations.bbk += farmPop;
          else if (farm.name.includes('JTP')) populations.jtp += farmPop;
        });

        setStats({
          totalPopulation: populations.bbk + populations.jtp,
          bbkPopulation: populations.bbk,
          jtpPopulation: populations.jtp,
          avgHD: Number(latestAvgHd.toFixed(2)),
          hdTrend: hdTrend,
          criticalGaps: criticalCount,
          activeFarms: farmData?.length || 0
        });

        setChartData(aggregatedChartData);
        setChartDataEgg(allCharts.egg);
        setChartDataFCR(allCharts.fcr);
        setChartDataFeed(allCharts.feed);
        setChartDataDeplesi(allCharts.deplesi);
        setGaps(computedGaps);
      }

      setFarms(filteredFarmData);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  const renderContent = () => {
    if (!session) {
      return <Login />;
    }

    switch (activeTab) {
      case 'sop':
        return <SopTracker farms={farms} />;

      case 'overview':
        return (
          <div className="animate-fade-in">
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
              <StatCard title="Avg. Hen Day (HD%)" value={`${stats.avgHD}%`} trend={`${stats.hdTrend >= 0 ? '+' : ''}${stats.hdTrend}% vs prev wk`} icon={<TrendingUp size={20} color="var(--primary)" />} />
              <StatCard title="Critical Gaps" value={stats.criticalGaps} trend="Active Alerts" icon={<AlertTriangle size={20} color="var(--destructive)" />} isUrgent={stats.criticalGaps > 0} />
              <StatCard title="Total Population" value={stats.totalPopulation.toLocaleString()} trend="Live Birds" icon={<Layers size={20} color="var(--primary)" />} />
              <StatCard title="Active Farms" value={stats.activeFarms} trend="Production Units" icon={<Activity size={20} color="var(--primary)" />} />
            </div>

            {/* Charts and Lists */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
              <div className="card" style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontWeight: 600 }}>Weekly HD% Performance</h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {['BBK', 'JTP'].map(f => (
                      <button
                        key={f}
                        onClick={() => {
                          if (overviewFarms.includes(f)) {
                            if (overviewFarms.length > 1) setOverviewFarms(overviewFarms.filter(x => x !== f));
                          } else {
                            setOverviewFarms([...overviewFarms, f]);
                          }
                        }}
                        style={{
                          padding: '0.4rem 1rem',
                          borderRadius: '8px',
                          border: overviewFarms.includes(f) ? `1px solid ${f === 'BBK' ? 'var(--primary)' : '#3b82f6'}` : '1px solid var(--border)',
                          backgroundColor: overviewFarms.includes(f) ? (f === 'BBK' ? 'rgba(191, 245, 73, 0.1)' : 'rgba(59, 130, 246, 0.1)') : 'transparent',
                          color: overviewFarms.includes(f) ? (f === 'BBK' ? 'var(--primary)' : '#3b82f6') : 'var(--muted-foreground)',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis 
                        dataKey="week" 
                        stroke="var(--muted-foreground)" 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={false}
                        interval={Math.floor(chartData.length / 10)}
                      />
                      <YAxis 
                        stroke="var(--muted-foreground)" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        domain={[(dataMin: number) => Math.max(0, Math.floor(dataMin / 10) * 10), 100]}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                        formatter={(value: any) => [`${value}%`]}
                      />
                      {overviewFarms.includes('BBK') && (
                        <Line 
                          type="monotone" 
                          dataKey="BBK" 
                          stroke="var(--primary)" 
                          strokeWidth={2.5}
                          dot={false}
                          connectNulls
                        />
                      )}
                      {overviewFarms.includes('JTP') && (
                        <Line 
                          type="monotone" 
                          dataKey="JTP" 
                          stroke="#3b82f6" 
                          strokeWidth={2.5}
                          dot={false}
                          connectNulls
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card" style={{ height: '450px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontWeight: 600 }}>Recent Alerts</h3>
                  <button onClick={() => setActiveTab('gaps')} style={{ border: 'none', background: 'none', fontSize: '0.875rem', color: 'var(--primary)', cursor: 'pointer' }}>View All</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
                  {gaps.filter(g => g.health_signal === 'BAD').slice(0, 5).map((gap, i) => (
                    <AlertItem 
                      key={i} 
                      title={`${gap.variable.toUpperCase().replace('_PCT', '')} ${Number(gap.change_pct).toFixed(1)}% — ${gap.kandang_name}`} 
                      subtitle={`${gap.farm_name} · Week ${gap.week_date ?? gap.week_to ?? '-'}`} 
                      severity="critical" 
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Secondary Charts Grid — 2 columns */}
            {(() => {
              const FarmToggle = ({ label, color, active, onClick }: { label: string; color: string; active: boolean; onClick: () => void }) => (
                <button onClick={onClick} style={{
                  padding: '0.3rem 0.8rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  border: active ? `1px solid ${color}` : '1px solid var(--border)',
                  backgroundColor: active ? `${color}22` : 'transparent',
                  color: active ? color : 'var(--muted-foreground)'
                }}>{label}</button>
              );

              const MiniChart = ({ data, unit, decimals = 2, domain }: { data: any[]; unit: string; decimals?: number; domain?: [any, any] }) => (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} interval={Math.floor((data.length || 1) / 8)} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false}
                      domain={domain || [(d: number) => Math.max(0, Math.floor(d / 10) * 10), (d: number) => Math.ceil(d / 10) * 10 + 5]}
                      tickFormatter={(v) => `${Number(v.toFixed(decimals))}${unit}`}
                      width={48}
                    />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.8rem' }}
                      formatter={(value: any) => [`${Number(value).toFixed(decimals)}${unit}`]} />
                    {overviewFarms.includes('BBK') && <Line type="monotone" dataKey="BBK" stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls />}
                    {overviewFarms.includes('JTP') && <Line type="monotone" dataKey="JTP" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />}
                  </LineChart>
                </ResponsiveContainer>
              );

              const chartRows = [
                { title: 'Egg Weight (g/btr)', data: chartDataEgg, unit: 'g', decimals: 1 },
                { title: 'FCR', data: chartDataFCR, unit: '', decimals: 3 },
                { title: 'Feed Intake (g/bird/day)', data: chartDataFeed, unit: 'g', decimals: 1 },
                { title: 'Deplesi (%)', data: chartDataDeplesi, unit: '%', decimals: 2 },
              ];

              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
                  {chartRows.map(({ title, data, unit, decimals }) => (
                    <div key={title} className="card" style={{ height: '320px', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{title}</h3>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <FarmToggle label="BBK" color="var(--primary)" active={overviewFarms.includes('BBK')}
                            onClick={() => overviewFarms.includes('BBK') ? (overviewFarms.length > 1 && setOverviewFarms(overviewFarms.filter(x => x !== 'BBK'))) : setOverviewFarms([...overviewFarms, 'BBK'])} />
                          <FarmToggle label="JTP" color="#3b82f6" active={overviewFarms.includes('JTP')}
                            onClick={() => overviewFarms.includes('JTP') ? (overviewFarms.length > 1 && setOverviewFarms(overviewFarms.filter(x => x !== 'JTP'))) : setOverviewFarms([...overviewFarms, 'JTP'])} />
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <MiniChart data={data} unit={unit} decimals={decimals} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <HDPerformanceTable farms={farms} />
          </div>
        );

      case 'farms':
        return (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.75rem' }}>Farm Infrastructure</h3>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                {/* BBK Population */}
                <div style={{ padding: '0.5rem 1rem', backgroundColor: 'rgba(191, 245, 73, 0.05)', border: '1px solid var(--primary)', color: 'var(--primary)', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700, opacity: 0.7 }}>BBK Population</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{stats.bbkPopulation.toLocaleString()}</span>
                </div>
                
                {/* JTP Population */}
                <div style={{ padding: '0.5rem 1rem', backgroundColor: 'rgba(59, 130, 246, 0.05)', border: '1px solid #3b82f6', color: '#3b82f6', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700, opacity: 0.7 }}>JTP Population</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{stats.jtpPopulation.toLocaleString()}</span>
                </div>

                {/* Total Population */}
                <div style={{ padding: '0.75rem 1.5rem', backgroundColor: 'rgba(191, 245, 73, 0.1)', border: '2px solid var(--primary)', color: 'var(--primary)', borderRadius: '12px', fontWeight: 800, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 4px 20px rgba(191, 245, 73, 0.15)' }}>
                  <Layers size={28} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8, lineHeight: 1, fontWeight: 700 }}>Total Live Birds</span>
                    <span style={{ lineHeight: 1, letterSpacing: '-0.02em' }}>{stats.totalPopulation.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(500px, 1fr))', gap: '1.5rem' }}>
              {farms.map((farm) => (
                <div key={farm.id} className="card" style={{ padding: '1.25rem', borderTop: '4px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ color: 'var(--primary)', fontSize: '1.25rem', margin: 0 }}>{farm.name}</h4>
                    <div style={{ backgroundColor: 'rgba(191, 245, 73, 0.1)', padding: '0.5rem', borderRadius: '8px' }}>
                      <Activity size={20} color="var(--primary)" />
                    </div>
                  </div>
                  
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: farm.kandang && farm.kandang.length > 3 ? '1fr 1fr' : '1fr', 
                    gap: '0.75rem',
                    flex: 1
                  }}>
                    {farm.kandang && Array.isArray(farm.kandang) ? farm.kandang.map((k: any) => (
                      <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', backgroundColor: 'var(--muted)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{k.name}</div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.875rem' }}>{k.populasi?.toLocaleString() || '0'} birds</div>
                          {k.populasi_last_updated && (
                            <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: '0.1rem' }}>as of {new Date(k.populasi_last_updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                          )}
                          {k.google_file_id && (
                            <div style={{ marginTop: '0.4rem' }}>
                              <a href={`https://docs.google.com/spreadsheets/d/${k.google_file_id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.2rem', justifyContent: 'flex-end', fontWeight: 600 }}>
                                <Layers size={12} /> Open in Sheets
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    )) : (
                      <p style={{ fontSize: '0.875rem', opacity: 0.6 }}>No kandang data found.</p>
                    )}
                  </div>

                  <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.875rem', opacity: 0.6 }}>Total Units</span>
                    <span style={{ fontWeight: 700 }}>{farm.kandang?.length || 0} Kandangs</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );


      case 'gaps':
        // Filter variables: HD, Egg Weight, FCR, Pakan, Deplesi
        const activeVariables = ['hd_pct', 'egg_weight', 'fcr', 'pakan', 'deplesi_pct'];
        
        // Filter logic
        let filteredGaps = gaps;
        if (gapFilterFarm) {
          filteredGaps = filteredGaps.filter(g => g.farm_name === gapFilterFarm);
        }
        if (gapFilterKandang) {
          filteredGaps = filteredGaps.filter(g => g.kandang_name === gapFilterKandang);
        }
        if (gapFilterVariable) {
          filteredGaps = filteredGaps.filter(g => g.variable === gapFilterVariable);
        }
        if (gapFilterType === 'std') {
          filteredGaps = filteredGaps.filter(g => g.comparison_mode === 'actual_vs_std');
        } else if (gapFilterType === 'actual') {
          filteredGaps = filteredGaps.filter(g => g.comparison_mode === 'actual_vs_actual');
        }

        // Count BAD + WATCH — Pakan uses WATCH, FCR/HD/etc use BAD
        const computeBadCount = (gapsToCount: ComputedGap[], filterFn?: (g: ComputedGap) => boolean) => {
          let selection = gapsToCount.filter(g => g.health_signal === 'BAD' || g.health_signal === 'WATCH');
          if (filterFn) selection = selection.filter(filterFn);
          return selection.length;
        };

        const scopeGaps = gaps.filter(g => {
          if (gapFilterFarm && g.farm_name !== gapFilterFarm) return false;
          if (gapFilterKandang && g.kandang_name !== gapFilterKandang) return false;
          return true;
        });

        const statsHeader = [
          { label: 'Total warnings', value: computeBadCount(scopeGaps), sub: 'bad changes only' },
          { label: 'HD', value: computeBadCount(scopeGaps, g => g.variable === 'hd_pct'), sub: 'below std / dropped' },
          { label: 'Berat Telur', value: computeBadCount(scopeGaps, g => g.variable === 'egg_weight'), sub: 'below std / dropped' },
          { label: 'Pakan', value: computeBadCount(scopeGaps, g => g.variable === 'pakan'), sub: 'above std / increased' },
          { label: 'FCR + Deplesi', value: computeBadCount(scopeGaps, g => g.variable === 'fcr' || g.variable === 'deplesi_pct'), sub: 'worsened week-on-week' },
        ];

        const FilterButton = ({ label, active, onClick, count }: { label: string, active: boolean, onClick: () => void, count?: number }) => (
          <button 
            onClick={onClick}
            style={{
              padding: '0.625rem 1.125rem',
              borderRadius: '10px',
              border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
              backgroundColor: active ? 'rgba(191, 245, 73, 0.1)' : 'transparent',
              color: active ? 'var(--primary)' : 'var(--muted-foreground)',
              cursor: 'pointer',
              fontSize: '0.8125rem',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {label}
            {count !== undefined && <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>({count})</span>}
          </button>
        );

        const availableKandangsForFilter = gapFilterFarm
          ? [...new Set(gaps.filter(g => g.farm_name === gapFilterFarm).map(g => g.kandang_name))]
              .map(name => ({ id: name, name }))
          : [];

        return (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            
            {/* Stats Header Mockup Style */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.5rem' }}>
              {statsHeader.map((s, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ fontSize: '0.85rem', opacity: 0.7, fontWeight: 500 }}>{s.label}</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.4 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Combined Filter Controls */}
            <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', backgroundColor: 'rgba(255,255,255,0.02)' }}>
              
              {/* 1. Variable Filter Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, opacity: 0.6, minWidth: '80px' }}>Variable:</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <FilterButton label="All" active={gapFilterVariable === null} onClick={() => setGapFilterVariable(null)} />
                  {activeVariables.map(v => (
                    <FilterButton 
                      key={v} 
                      label={v === 'hd_pct' ? 'HD' : v === 'egg_weight' ? 'Berat Telur' : v === 'pakan' ? 'Pakan' : v === 'fcr' ? 'FCR' : 'Deplesi'} 
                      active={gapFilterVariable === v} 
                      onClick={() => setGapFilterVariable(v)} 
                    />
                  ))}
                </div>
                
                <div style={{ height: '32px', width: '1px', backgroundColor: 'var(--border)', margin: '0 1rem' }} />
                
                <div style={{ fontSize: '0.875rem', fontWeight: 600, opacity: 0.6 }}>Type:</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <FilterButton label="All" active={gapFilterType === 'all'} onClick={() => setGapFilterType('all')} />
                </div>
              </div>

              {/* 2. Comparison Type Mode Row (The big buttons in mockup) */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button 
                  onClick={() => setGapFilterType('std')}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    backgroundColor: gapFilterType === 'std' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: gapFilterType === 'std' ? 'white' : 'var(--muted-foreground)',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Actual vs Std
                </button>
                <button 
                  onClick={() => setGapFilterType('actual')}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    backgroundColor: gapFilterType === 'actual' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: gapFilterType === 'actual' ? 'white' : 'var(--muted-foreground)',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  n vs n-1
                </button>
              </div>

              {/* 3. Farm & Kandang flow row */}
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                 <div style={{ flex: '1 1 300px' }}>
                    <label style={{ fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Farm Location</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <FilterButton label="All Farms" active={gapFilterFarm === null} onClick={() => { setGapFilterFarm(null); setGapFilterKandang(null); }} />
                      {farms.map(f => (
                        <FilterButton key={f.id} label={f.name} active={gapFilterFarm === f.name} onClick={() => { setGapFilterFarm(f.name); setGapFilterKandang(null); }} />
                      ))}
                    </div>
                 </div>
                 {gapFilterFarm && (
                   <div className="animate-scale-in" style={{ flex: '2 1 400px' }}>
                      <label style={{ fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Unit / Kandang</label>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <FilterButton label="All Units" active={gapFilterKandang === null} onClick={() => setGapFilterKandang(null)} />
                        {availableKandangsForFilter.map((k: any) => (
                          <FilterButton key={k.id} label={k.name} active={gapFilterKandang === k.name} onClick={() => setGapFilterKandang(k.name)} />
                        ))}
                      </div>
                   </div>
                 )}
              </div>
            </div>

            {/* Consolidated Table (The list displayed like mockup) */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', opacity: 0.4, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '1.25rem 1.5rem' }}>Week</th>
                      <th style={{ padding: '1.25rem 1.5rem' }}>Date</th>
                      <th style={{ padding: '1.25rem 1.5rem' }}>Variable</th>
                      <th style={{ padding: '1.25rem 1.5rem' }}>Comparison</th>
                      <th style={{ padding: '1.25rem 1.5rem' }}>Actual</th>
                      <th style={{ padding: '1.25rem 1.5rem' }}>Reference</th>
                      <th style={{ padding: '1.25rem 1.5rem' }}>Gap %</th>
                      <th style={{ padding: '1.25rem 1.5rem' }}>Issue</th>
                      <th style={{ padding: '1.25rem 1.5rem' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGaps.length > 0 ? filteredGaps.map((gap, i) => {
                      const issueText = gap.direction === 'BELOW STANDARD' ? 'below std' : 
                                      gap.direction === 'ABOVE STANDARD' ? 'above std' : 
                                      gap.direction === 'DECREASING' ? 'dropped' : 'increased';
                      const isBad = gap.health_signal === 'BAD';
                      const isDropped = gap.direction === 'DECREASING';
                      
                      return (
                        <tr 
                          key={i} 
                          style={{ 
                            borderBottom: i === filteredGaps.length - 1 ? 'none' : '1px solid var(--border)', 
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.03)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                          onClick={() => { if (gap.farm_id && gap.kandang_id) navigateToAnalytics(gap.farm_id, gap.kandang_id); }}
                        >
                          <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>Wk {gap.usia_minggu}</td>
                          <td style={{ padding: '1.25rem 1.5rem', opacity: 0.6 }}>{gap.week_date ?? gap.week_to}</td>
                          <td style={{ padding: '1.25rem 1.5rem', fontWeight: 600 }}>{gap.variable === 'hd_pct' ? 'HD' : gap.variable === 'egg_weight' ? 'Berat Telur' : gap.variable === 'pakan' ? 'Pakan' : gap.variable === 'fcr' ? 'FCR' : 'Deplesi'}</td>
                          <td style={{ padding: '1.25rem 1.5rem' }}>
                            <span style={{ 
                              padding: '0.25rem 0.6rem', 
                              borderRadius: '100px', 
                              fontSize: '0.7rem', 
                              fontWeight: 700, 
                              backgroundColor: gap.comparison_mode === 'actual_vs_std' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.08)', 
                              color: gap.comparison_mode === 'actual_vs_std' ? '#60a5fa' : 'white',
                              border: '1px solid rgba(255,255,255,0.05)'
                            }}>
                              {gap.comparison_mode === 'actual_vs_std' ? 'Actual vs Std' : 'n vs n-1'}
                            </span>
                          </td>
                          <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>{Number(gap.actual_value).toFixed(2)}</td>
                          <td style={{ padding: '1.25rem 1.5rem', opacity: 0.6 }}>{Number(gap.reference_value).toFixed(2)}</td>
                          <td style={{ padding: '1.25rem 1.5rem', color: '#72b347', fontWeight: 700 }}>
                            {Number(gap.change_pct).toFixed(2)}%
                          </td>
                          <td style={{ padding: '1.25rem 1.5rem' }}>
                             <span style={{ 
                               display: 'inline-flex',
                               alignItems: 'center',
                               gap: '0.3rem',
                               padding: '0.25rem 0.6rem', 
                               borderRadius: '4px', 
                               fontSize: '0.7rem', 
                               fontWeight: 600, 
                               backgroundColor: isBad ? 'rgba(239, 68, 68, 0.1)' : 'rgba(191, 245, 73, 0.1)',
                               color: isBad ? '#fca5a5' : '#bff549',
                               whiteSpace: 'nowrap'
                             }}>
                               {isDropped && <TrendingDown size={12} />}
                               {issueText}
                             </span>
                          </td>
                          <td style={{ padding: '1.25rem 1.5rem' }}>
                            <ChevronDown size={14} style={{ opacity: 0.3, transform: 'rotate(-90deg)' }} />
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={9} style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                          No warnings found for the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );


      case 'analytics':
        return <AnalyticsPanel farms={farms} initialFarmId={analyticsFarmId} initialKandangId={analyticsKandangId} />;
      case 'comparison':
        return <ComparisonPanel farms={farms} />;
      case 'ai':
        return <ChatPanel />;
      default:
        return null;
    }
  };


  return (
    <>
      {session && (
      <div style={{
        display: 'flex', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        marginLeft: isSidebarOpen ? '260px' : '80px',
        width: isSidebarOpen ? 'calc(100% - 260px)' : 'calc(100% - 80px)'
      }}>
        {/* Sidebar */}
        <div style={{
          width: isSidebarOpen ? '260px' : '80px', backgroundColor: 'var(--card)', borderRight: '1px solid var(--border)',
          height: '100vh', position: 'fixed', left: 0, top: 0,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 40, display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ padding: isSidebarOpen ? '1.5rem' : '1.5rem 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'space-between' : 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }}>
              <div style={{ width: '36px', height: '36px', backgroundColor: 'var(--primary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart3 size={20} className="text-[#0a0a0a]" />
              </div>
              {isSidebarOpen && <h1 style={{ fontWeight: 700, fontSize: '1.25rem', letterSpacing: '-0.02em', whiteSpace: 'nowrap', margin: 0 }}>PPFC</h1>}
            </div>
            {isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex' }}>
                <PanelLeftClose size={20} />
              </button>
            )}
          </div>

          {/* Collapsed menu switch button (only visible when closed) */}
          {!isSidebarOpen && (
            <button onClick={() => setIsSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '1rem', display: 'flex', justifyContent: 'center' }}>
              <PanelLeftOpen size={20} />
            </button>
          )}

          {/* Navigation */}
          <nav style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', overflowX: 'hidden' }}>
             <NavItem icon={<Layers size={20} />} label="Ringkasan" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} collapsed={!isSidebarOpen} />
             <NavItem icon={<Activity size={20} />} label="Infrastruktur" active={activeTab === 'farms'} onClick={() => setActiveTab('farms')} collapsed={!isSidebarOpen} />
             <NavItem icon={<AlertTriangle size={20} />} label="Diagnostik" active={activeTab === 'gaps'} onClick={() => setActiveTab('gaps')} collapsed={!isSidebarOpen} />
             <NavItem icon={<TrendingDown size={20} />} label="Metrik Mendalam" active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} collapsed={!isSidebarOpen} />
             <NavItem icon={<Columns2 size={20} />} label="Perbandingan" active={activeTab === 'comparison'} onClick={() => setActiveTab('comparison')} collapsed={!isSidebarOpen} />
             <NavItem icon={<ClipboardCheck size={20} />} label="Pelacak SOP" active={activeTab === 'sop'} onClick={() => setActiveTab('sop')} collapsed={!isSidebarOpen} />
             <NavItem icon={<MessageSquare size={20} />} label="Asisten AI" active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} collapsed={!isSidebarOpen} />
             
             <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
               <NavItem 
                 icon={<LogOut size={20} color="var(--destructive)" />} 
                 label="Keluar" 
                 active={false} 
                 onClick={async () => { await supabase.auth.signOut(); setSession(null); }} 
                 collapsed={!isSidebarOpen} 
               />
             </div>
          </nav>
        </div>

        {/* Main Content */}
        <main style={{ flex: 1, padding: '2rem 3rem', minHeight: '100vh', backgroundColor: '#050505', display: 'flex', justifyContent: 'center', overflowX: 'hidden' }}>
          <div style={{ width: '100%', maxWidth: '1600px' }}>
            {activeTab !== 'sop' && (
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                    {activeTab === 'overview' ? 'Dasbor Eksekutif' :
                      activeTab === 'farms' ? 'Manajemen Peternakan' :
                        activeTab === 'gaps' ? 'Peringatan Performa' :
                          activeTab === 'comparison' ? 'Perbandingan Unit' :
                            activeTab === 'ai' ? 'Pusat Kecerdasan' : 'Analisis Produksi'}

                  </h2>
                  <p style={{ color: 'var(--muted-foreground)' }}>
                    {activeTab === 'overview' ? 'Kecerdasan produksi real-time dan analisis gap.' :
                      activeTab === 'farms' ? 'Inventaris dan populasi per unit kandang.' :
                        activeTab === 'gaps' ? '' :
                          activeTab === 'comparison' ? 'Analisis produksi berdampingan.' :
                            activeTab === 'ai' ? 'Model multi-modal canggih untuk wawasan peternakan.' : 'Model statistik dan prakiraan tren.'}

                  </p>
                </div>
                {/* Removed manual Refresh component since data is synced automatically at midnight */}
              </header>
            )}

            {renderContent()}
          </div>
        </main>
      </div>
      )}
      
      {!session && renderContent()}
    </>
  );
}function StatCard({ title, value, trend, icon, isUrgent = false }: { title: string, value: string | number, trend: string, icon: React.ReactNode, isUrgent?: boolean }) {
  return (
    <div className="card" style={{ borderLeftWidth: isUrgent ? '4px' : '1px', borderLeftColor: isUrgent ? 'var(--destructive)' : 'var(--border)', padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>{title}</span>
        {icon}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: isUrgent ? 'var(--destructive)' : 'var(--primary)', opacity: 0.8 }}>{trend}</div>
    </div>
  );
}

function AlertItem({ title, subtitle, severity }: { title: string, subtitle: string, severity: 'critical' | 'warning' }) {
  return (
    <div style={{ borderLeft: `2px solid ${severity === 'critical' ? 'var(--destructive)' : 'var(--warning)'}`, paddingLeft: '1rem' }}>
      <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{subtitle}</div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, collapsed: boolean }) {
  const isDanger = label === 'Log Out';
  return (
    <button onClick={onClick} style={{
      width: '100%',
      textAlign: 'left',
      padding: collapsed ? '0.75rem 0' : '0.875rem 1rem',
      borderRadius: '8px',
      cursor: 'pointer',
      border: 'none',
      background: active ? 'rgba(191,245,73,0.1)' : 'transparent',
      color: isDanger ? 'var(--destructive)' : active ? 'var(--primary)' : 'var(--muted-foreground)',
      fontWeight: active ? 600 : 400,
      fontSize: '1.05rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: collapsed ? 'center' : 'flex-start',
      gap: collapsed ? '0' : '1rem',
      transition: 'all 0.2s ease',
      whiteSpace: 'nowrap',
      overflow: 'hidden'
    }}>
      <div style={{ minWidth: '24px', display: 'flex', justifyContent: 'center', color: isDanger ? 'var(--destructive)' : 'inherit' }}>{icon}</div>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}
