import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  ClipboardCheck,
  ClipboardList,
  Settings,
  BarChart2,
  Plus,
  Users,
  TrendingUp,
  AlertTriangle,
  FileText,
  Calendar,
  CheckCircle2,
  Trash2,
  Edit2,
  X,
  GripVertical
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
interface SopTrackerProps {
  farms: any[];
}

export function SopTracker({ farms }: SopTrackerProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'daily' | 'builder' | 'performance'>('overview');
  const [_loading, setLoading] = useState(false);
  
  // Data State
  const [stats, setStats] = useState({
    activeSops: 0,
    operators: 0,
    todayExecutions: 0,
    avgCompletion: 0,
  });

  const [templates, setTemplates] = useState<any[]>([]);

  // Builder State
  const [isBuilding, setIsBuilding] = useState(false);
  const [builderTemplate, setBuilderTemplate] = useState<any>({
    id: '', title: '', farm: 'BBK', kandang: '', frequency: 'daily', category: 'Biosecurity', description: '', tasks: []
  });

  const [operators, setOperators] = useState<any[]>([]);
  const [newOperatorName, setNewOperatorName] = useState('');
  const [executions, setExecutions] = useState<any[]>([]);

  // Daily Checklist State
  const [selectedOperator, setSelectedOperator] = useState<string>('manual');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  
  // Execution State
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionTasks, setExecutionTasks] = useState<any[]>([]);
  const [executionNotes, setExecutionNotes] = useState('');

  // Performance Filter State
  const [filterFarm, setFilterFarm] = useState('All Farms');
  const [filterOperator, setFilterOperator] = useState('All Operators');
  const [filterTimeRange, setFilterTimeRange] = useState('Last 30 days');

  const fetchSopData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Operators
      const { data: opsData } = await supabase.from('operators').select('*').eq('is_active', true);
      if (opsData) setOperators(opsData);

      // 2. Fetch Templates
      const { data: tmplData } = await supabase.from('sop_templates').select('*').eq('is_active', true);
      if (tmplData) setTemplates(tmplData);

      // 3. Fetch Executions
      const { data: execData } = await supabase.from('sop_executions').select('*');
      if (execData) setExecutions(execData);

      // Calculate stats based on fetched data
      const todayStr = new Date().toISOString().split('T')[0];
      const todaysExecutions = execData?.filter(e => e.execution_date === todayStr) || [];
      const totalProgress = execData?.reduce((sum, e) => sum + (e.progress_pct || 0), 0) || 0;
      const avgComp = execData && execData.length > 0 ? Math.round(totalProgress / execData.length) : 0;

      setStats({
        activeSops: tmplData?.length || 0,
        operators: opsData?.length || 0,
        todayExecutions: todaysExecutions.length,
        avgCompletion: avgComp,
      });

    } catch (error) {
      console.error('Error fetching SOP data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSopData();
  }, []);

  const TabButton = ({ id, label, icon: Icon }: { id: any, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1rem',
        backgroundColor: 'transparent',
        border: 'none',
        borderBottom: activeTab === id ? '2px solid var(--primary)' : '2px solid transparent',
        color: activeTab === id ? 'var(--primary)' : 'var(--muted-foreground)',
        fontWeight: activeTab === id ? 600 : 500,
        fontSize: '0.875rem',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      <Icon size={16} />
      {label}
    </button>
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>

        <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 0.25rem 0', letterSpacing: '-0.02em' }}>
          Pelacak SOP Operator
        </h2>
        <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Kelola prosedur operasi standar dan lacak performa operator
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
        <TabButton id="overview" label="Ringkasan" icon={ClipboardList} />
        <TabButton id="daily" label="Daftar Periksa Harian" icon={ClipboardCheck} />
        <TabButton id="builder" label="Pembuat SOP" icon={Settings} />
        <TabButton id="performance" label="Performa" icon={BarChart2} />
      </div>

      {/* Content Area */}
      <div style={{ flex: 1 }}>
        {activeTab === 'overview' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', fontWeight: 600 }}>SOP Aktif</span>
                  <div style={{ backgroundColor: 'rgba(191, 245, 73, 0.1)', padding: '0.4rem', borderRadius: '6px' }}>
                    <FileText size={16} color="var(--primary)" />
                  </div>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>{stats.activeSops}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Templat dikonfigurasi</div>
              </div>
              
              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', fontWeight: 600 }}>Operator</span>
                  <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '0.4rem', borderRadius: '6px' }}>
                    <Users size={16} color="var(--muted-foreground)" />
                  </div>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>{stats.operators}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Staf aktif</div>
              </div>

              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', fontWeight: 600 }}>Eksekusi Hari Ini</span>
                  <div style={{ backgroundColor: 'rgba(191, 245, 73, 0.1)', padding: '0.4rem', borderRadius: '6px' }}>
                    <TrendingUp size={16} color="var(--primary)" />
                  </div>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>{stats.todayExecutions}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}</div>
              </div>

              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', fontWeight: 600 }}>Rata-rata Penyelesaian</span>
                  <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '0.4rem', borderRadius: '6px' }}>
                    <AlertTriangle size={16} color="var(--muted-foreground)" />
                  </div>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>{stats.avgCompletion}%</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Rata-rata keseluruhan</div>
              </div>
            </div>

            {/* Farm Progress Bars */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {['BBK', 'JTP'].map(farmName => {
                const farmObj = farms.find(f => f.name.includes(farmName));
                const farmTemplates = templates.filter(t => t.farm_id === farmObj?.id).map(t => t.id);
                const farmExecs = executions.filter(e => farmTemplates.includes(e.template_id));
                const runs = farmExecs.length;
                const avg = runs > 0 ? Math.round(farmExecs.reduce((sum, e) => sum + (e.progress_pct || 0), 0) / runs) : 0;

                return (
                  <div key={farmName} className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Kandang {farmName}</h4>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{runs} eksekusi tercatat</span>
                      </div>
                      <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>{avg}%</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--muted)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${avg}%`, height: '100%', backgroundColor: 'var(--primary)' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recent Executions */}
            <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', minHeight: '300px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Eksekusi SOP Terbaru</h3>
                <button onClick={() => setActiveTab('daily')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }}>
                  Tambah Baru →
                </button>
              </div>
              
              {executions.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', gap: '1rem' }}>
                  <ClipboardCheck size={32} opacity={0.5} />
                  <p style={{ margin: 0, fontSize: '0.875rem' }}>Belum ada eksekusi yang tercatat.</p>
                  <button 
                    onClick={() => setActiveTab('daily')}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: 'var(--primary)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <Plus size={16} />
                    Mulai Daftar Periksa Pertama
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {executions.slice().reverse().slice(0, 5).map(exec => {
                    const template = templates.find(t => t.id === exec.template_id);
                    const operator = operators.find(o => o.id === exec.operator_id);
                    return (
                      <div key={exec.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{template?.title || 'Unknown Template'}</h4>
                          <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>{operator?.name || 'Unknown'} · {new Date(exec.created_at).toLocaleDateString('id-ID')}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>{exec.progress_pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'daily' && !isExecuting && (
          <div className="animate-fade-in" style={{ maxWidth: '800px' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem' }}>Mulai Daftar Periksa Harian</h3>
            
            {/* Form Container */}
            <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
              
              {/* Operator Select */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Users size={14} color="var(--primary)" />
                  Operator
                </label>
                <select 
                  value={selectedOperator}
                  onChange={(e) => setSelectedOperator(e.target.value)}
                  style={{ 
                    padding: '0.75rem 1rem', 
                    backgroundColor: '#121212', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '0.875rem',
                    appearance: 'none', // to style better, though might need a custom wrapper for the arrow
                  }}
                >
                  {operators.map(op => (
                    <option key={op.id} value={op.id}>{op.name}</option>
                  ))}
                  <option value="manual">+ Masukkan manual</option>
                </select>
                {selectedOperator === 'manual' && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <input 
                      type="text" 
                      placeholder="Masukkan nama operator baru..."
                      value={newOperatorName}
                      onChange={e => setNewOperatorName(e.target.value)}
                      style={{ flex: 1, padding: '0.75rem 1rem', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white', fontSize: '0.875rem' }}
                    />
                    <button 
                      onClick={async () => {
                        if (newOperatorName.trim()) {
                          const { data, error } = await supabase.from('operators').insert([{ name: newOperatorName }]).select().single();
                          if (error) {
                            alert('Error adding operator: ' + error.message);
                            return;
                          }
                          setOperators([...operators, data]);
                          setSelectedOperator(data.id);
                          setNewOperatorName('');
                        }
                      }}
                      style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--primary)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}
                    >
                      Tambah
                    </button>
                  </div>
                )}
              </div>

              {/* Date Select */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={14} color="var(--primary)" />
                  Tanggal
                </label>
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{ 
                    padding: '0.75rem 1rem', 
                    backgroundColor: 'rgba(0,0,0,0.2)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '0.875rem',
                    colorScheme: 'dark'
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', fontWeight: 600, marginBottom: '1rem' }}>
              Pilih Templat SOP
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {templates.map(template => (
                <div 
                  key={template.id} 
                  className="card" 
                  style={{ 
                    padding: '1.25rem', 
                    cursor: 'pointer', 
                    border: selectedTemplate?.id === template.id ? '1px solid var(--primary)' : '1px solid var(--border)',
                    backgroundColor: selectedTemplate?.id === template.id ? 'rgba(191, 245, 73, 0.05)' : 'var(--card)',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onClick={() => setSelectedTemplate(template)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{template.title}</h4>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
                      {template.title.split(' ')[0]} {template.title.includes('Routine') ? 'Rutin' : ''} · {farms.find(f => f.id === template.farm_id)?.name?.replace('Kandang ', '') || 'Unknown'} · {farms.flatMap(f => f.kandang || []).find(k => k.id === template.kandang_id)?.name || 'Unknown'} · {template.tasks?.length || 0} tugas
                    </span>
                  </div>
                  <div style={{ color: selectedTemplate?.id === template.id ? 'var(--primary)' : 'var(--muted-foreground)' }}>
                    {selectedTemplate?.id === template.id ? <CheckCircle2 size={20} /> : <span style={{ fontSize: '1.2rem' }}>›</span>}
                  </div>
                </div>
              ))}
            </div>
            
            {selectedTemplate && !isExecuting && (
              <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => {
                    setIsExecuting(true);
                    setExecutionTasks(selectedTemplate.tasks?.map((t: any) => ({ ...t, completed: false })) || []);
                    setExecutionNotes('');
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: 'var(--primary)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Mulai Eksekusi →
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'daily' && isExecuting && selectedTemplate && (
          <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
              <div>
                <button 
                  onClick={() => setIsExecuting(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', fontSize: '0.875rem', cursor: 'pointer', padding: 0, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  ← Kembali
                </button>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>{selectedTemplate.title}</h3>
                <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                  {operators.find(o => o.id === selectedOperator)?.name || 'Tanpa operator'} · {selectedDate}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)', lineHeight: 1 }}>
                  {executionTasks.length > 0 ? Math.round((executionTasks.filter(t => t.completed).length / executionTasks.length) * 100) : 0}%
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                  {executionTasks.filter(t => t.completed).length}/{executionTasks.length} selesai
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '2rem', backgroundColor: 'rgba(255,255,255,0.02)' }}>
              {executionTasks.map((task, idx) => (
                <div 
                  key={task.id}
                  onClick={() => {
                    const newTasks = [...executionTasks];
                    newTasks[idx].completed = !newTasks[idx].completed;
                    setExecutionTasks(newTasks);
                  }}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1rem', 
                    padding: '1.25rem', 
                    borderBottom: idx < executionTasks.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    backgroundColor: task.completed ? 'rgba(191, 245, 73, 0.05)' : 'transparent',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ color: task.completed ? 'var(--primary)' : 'var(--muted-foreground)' }}>
                    {task.completed ? <CheckCircle2 size={24} /> : <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid var(--muted-foreground)', marginLeft: '2px' }} />}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: task.completed ? 'var(--foreground)' : 'var(--foreground)', opacity: task.completed ? 0.7 : 1 }}>
                        {task.title}
                      </h4>
                      {task.critical && (
                        <span style={{ padding: '0.1rem 0.4rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'rgb(239, 68, 68)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>Kritis</span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>{task.description}</span>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', fontWeight: 600, opacity: 0.5 }}>
                    {idx + 1}
                  </div>
                </div>
              ))}
              {executionTasks.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                  Tidak ada tugas yang dikonfigurasi untuk templat ini.
                </div>
              )}
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem', display: 'block' }}>Catatan / Keterangan (opsional)</label>
              <textarea 
                value={executionNotes}
                onChange={(e) => setExecutionNotes(e.target.value)}
                placeholder="Tulis observasi atau catatan di sini..."
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '1rem',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '0.875rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <button 
              onClick={async () => {
                try {
                  const progressPct = executionTasks.length > 0 
                    ? Math.round((executionTasks.filter(t => t.completed).length / executionTasks.length) * 100) 
                    : 0;

                  const { error } = await supabase.from('sop_executions').insert([{
                    template_id: selectedTemplate.id,
                    operator_id: selectedOperator === 'manual' ? null : selectedOperator,
                    kandang_id: selectedTemplate.kandang_id,
                    execution_date: selectedDate,
                    progress_pct: progressPct,
                    notes: executionNotes,
                    task_results: executionTasks
                  }]);

                  if (error) throw error;
                  
                  alert('Daftar Periksa Disimpan!');
                  setIsExecuting(false);
                  setSelectedTemplate(null);
                  fetchSopData();
                } catch (err: any) {
                  console.error('Error saving checklist:', err);
                  alert('Gagal menyimpan daftar periksa: ' + (err.message || JSON.stringify(err)));
                }
              }}
              style={{
                width: '100%',
                padding: '1rem',
                backgroundColor: 'var(--primary)',
                color: '#000',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <FileText size={18} />
              Simpan Daftar Periksa ({executionTasks.length > 0 ? Math.round((executionTasks.filter(t => t.completed).length / executionTasks.length) * 100) : 0}% Selesai)
            </button>
          </div>
        )}

        {activeTab === 'builder' && !isBuilding && (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.25rem 0' }}>Templat SOP</h3>
                <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>{templates.length} templat dikonfigurasi</span>
              </div>
              <button 
                onClick={() => {
                  setBuilderTemplate({ id: '', title: '', farm: 'BBK', kandang: '', frequency: 'daily', category: 'Biosecurity', description: '', tasks: [] });
                  setIsBuilding(true);
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'var(--primary)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '20px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Plus size={16} />
                Templat Baru
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
              {templates.map(template => (
                <div key={template.id} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '4px solid var(--primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ padding: '0.2rem 0.5rem', backgroundColor: 'rgba(191, 245, 73, 0.1)', color: 'var(--primary)', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>Aktif</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{farms.find(f => f.id === template.farm_id)?.name?.replace('Kandang ', '') || 'Unknown'} · {farms.flatMap(f => f.kandang || []).find(k => k.id === template.kandang_id)?.name || 'Unknown'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--muted-foreground)' }}>
                      <button 
                        onClick={() => {
                          const farmObj = farms.find(f => f.id === template.farm_id);
                          const kandangObj = farms.flatMap(f => f.kandang || []).find(k => k.id === template.kandang_id);
                          
                          setBuilderTemplate({ 
                            ...template, 
                            farm: farmObj?.name?.replace('Kandang ', '') || 'BBK',
                            kandang: kandangObj?.name || '',
                            tasks: template.tasks || [] 
                          });
                          setIsBuilding(true);
                        }}
                        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.2rem' }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={async () => {
                          if (confirm('Apakah Anda yakin ingin menghapus templat ini?')) {
                            try {
                              const { error } = await supabase.from('sop_templates').update({ is_active: false }).eq('id', template.id);
                              if (error) throw error;
                              fetchSopData();
                            } catch (err) {
                              console.error(err);
                              alert('Gagal menghapus templat');
                            }
                          }
                        }}
                        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.2rem' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.125rem', fontWeight: 600 }}>{template.title}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{template.title.split(' ')[0]} - {template.frequency}</span>
                  </div>
                  
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                    {template.description}
                  </p>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>{template.tasks?.length || 0} tugas</span>
                    <button style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', fontSize: '0.75rem', cursor: 'pointer' }}>Nonaktifkan</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'builder' && isBuilding && (
          <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button 
                  onClick={() => setIsBuilding(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', padding: 0 }}
                >
                  ← Kembali
                </button>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
                  {builderTemplate.id ? 'Edit Templat' : 'Buat Templat Baru'}
                </h3>
              </div>
              <button 
                onClick={async () => {
                  try {
                    const selectedFarm = farms.find(f => f.name.includes(builderTemplate.farm));
                    const selectedKandang = selectedFarm?.kandang?.find((k: any) => k.name === builderTemplate.kandang);

                    const templateData = {
                      title: builderTemplate.title,
                      farm_id: selectedFarm?.id || null,
                      kandang_id: selectedKandang?.id || null,
                      frequency: builderTemplate.frequency,
                      description: builderTemplate.description,
                      tasks: builderTemplate.tasks,
                      is_active: true
                    };
              
                    if (builderTemplate.id) {
                      const { error } = await supabase.from('sop_templates').update(templateData).eq('id', builderTemplate.id);
                      if (error) throw error;
                    } else {
                      const { error } = await supabase.from('sop_templates').insert([templateData]);
                      if (error) throw error;
                    }
                    
                    alert('Templat berhasil disimpan!');
                    setIsBuilding(false);
                    fetchSopData();
                  } catch (error: any) {
                    console.error('Save template error:', error);
                    alert('Gagal menyimpan templat: ' + (error.message || JSON.stringify(error)));
                  }
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'var(--primary)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <FileText size={16} />
                Simpan Templat
              </button>
            </div>

            <div className="card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Judul Templat</label>
                  <input 
                    type="text" 
                    value={builderTemplate.title}
                    onChange={e => setBuilderTemplate({...builderTemplate, title: e.target.value})}
                    style={{ padding: '0.75rem 1rem', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white' }}
                  />
                </div>
                <div style={{ width: '200px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Frekuensi</label>
                  <select 
                    value={builderTemplate.frequency}
                    onChange={e => setBuilderTemplate({...builderTemplate, frequency: e.target.value})}
                    style={{ padding: '0.75rem 1rem', backgroundColor: '#121212', border: '1px solid var(--border)', borderRadius: '8px', color: 'white' }}
                  >
                    <option value="daily">Harian</option>
                    <option value="weekly">Mingguan</option>
                    <option value="monthly">Bulanan</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Kandang</label>
                  <select 
                    value={builderTemplate.farm}
                    onChange={e => setBuilderTemplate({...builderTemplate, farm: e.target.value, kandang: ''})}
                    style={{ padding: '0.75rem 1rem', backgroundColor: '#121212', border: '1px solid var(--border)', borderRadius: '8px', color: 'white' }}
                  >
                    <option value="BBK">BBK</option>
                    <option value="JTP">JTP</option>
                  </select>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Unit</label>
                  <select 
                    value={builderTemplate.kandang}
                    onChange={e => setBuilderTemplate({...builderTemplate, kandang: e.target.value})}
                    style={{ padding: '0.75rem 1rem', backgroundColor: '#121212', border: '1px solid var(--border)', borderRadius: '8px', color: 'white' }}
                  >
                    <option value="">Pilih Unit</option>
                    {farms.find(f => f.name.includes(builderTemplate.farm))?.kandang?.map((k: any) => (
                      <option key={k.id} value={k.name}>{k.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Deskripsi</label>
                <textarea 
                  value={builderTemplate.description}
                  onChange={e => setBuilderTemplate({...builderTemplate, description: e.target.value})}
                  style={{ padding: '0.75rem 1rem', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white', minHeight: '80px', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Tugas</h4>
                  <button 
                    onClick={() => {
                      setBuilderTemplate({
                        ...builderTemplate, 
                        tasks: [...(builderTemplate.tasks || []), { id: Date.now().toString(), title: '', description: '', critical: false }]
                      });
                    }}
                    style={{ padding: '0.5rem 1rem', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <Plus size={14} /> Tambah Tugas
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {(builderTemplate.tasks || []).map((task: any, idx: number) => (
                    <div key={task.id} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <div style={{ cursor: 'grab', padding: '0.5rem', color: 'var(--muted-foreground)' }}>
                        <GripVertical size={16} />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <input 
                          type="text" 
                          value={task.title}
                          onChange={e => {
                            const newTasks = [...builderTemplate.tasks];
                            newTasks[idx].title = e.target.value;
                            setBuilderTemplate({...builderTemplate, tasks: newTasks});
                          }}
                          placeholder="Judul Tugas"
                          style={{ padding: '0.5rem', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'white', fontSize: '1rem', fontWeight: 500 }}
                        />
                        <input 
                          type="text" 
                          value={task.description}
                          onChange={e => {
                            const newTasks = [...builderTemplate.tasks];
                            newTasks[idx].description = e.target.value;
                            setBuilderTemplate({...builderTemplate, tasks: newTasks});
                          }}
                          placeholder="Deskripsi Tugas (opsional)"
                          style={{ padding: '0.5rem', backgroundColor: 'transparent', border: 'none', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input 
                            type="checkbox" 
                            checked={task.critical}
                            onChange={e => {
                              const newTasks = [...builderTemplate.tasks];
                              newTasks[idx].critical = e.target.checked;
                              setBuilderTemplate({...builderTemplate, tasks: newTasks});
                            }}
                            id={`critical-${task.id}`}
                          />
                          <label htmlFor={`critical-${task.id}`} style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', cursor: 'pointer' }}>Tandai sebagai Tugas Kritis</label>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          const newTasks = [...builderTemplate.tasks];
                          newTasks.splice(idx, 1);
                          setBuilderTemplate({...builderTemplate, tasks: newTasks});
                        }}
                        style={{ background: 'none', border: 'none', color: 'rgb(239, 68, 68)', cursor: 'pointer', padding: '0.5rem' }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  {(!builderTemplate.tasks || builderTemplate.tasks.length === 0) && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)', fontSize: '0.875rem', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                      Belum ada tugas yang ditambahkan. Klik "Tambah Tugas" untuk memulai.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'performance' && (() => {
          let perfExecutions = [...executions];
          
          const today = new Date();
          perfExecutions = perfExecutions.filter(exec => {
            const execDate = new Date(exec.execution_date);
            const diffDays = Math.ceil(Math.abs(today.getTime() - execDate.getTime()) / (1000 * 60 * 60 * 24)); 
            if (filterTimeRange === 'Last 30 days') return diffDays <= 30;
            if (filterTimeRange === 'Last 7 days') return diffDays <= 7;
            if (filterTimeRange === 'This month') return execDate.getMonth() === today.getMonth() && execDate.getFullYear() === today.getFullYear();
            return true;
          });

          if (filterFarm !== 'All Farms') {
            const farmObj = farms.find(f => f.name.includes(filterFarm));
            if (farmObj) {
              const farmTemplateIds = templates.filter(t => t.farm_id === farmObj.id).map(t => t.id);
              perfExecutions = perfExecutions.filter(exec => farmTemplateIds.includes(exec.template_id));
            } else {
              perfExecutions = [];
            }
          }

          if (filterOperator !== 'All Operators') {
            const opObj = operators.find(o => o.name === filterOperator);
            if (opObj) {
              perfExecutions = perfExecutions.filter(exec => exec.operator_id === opObj.id);
            } else {
              perfExecutions = [];
            }
          }

          const filteredAvgCompletion = perfExecutions.length > 0 
            ? Math.round(perfExecutions.reduce((sum, e) => sum + (e.progress_pct || 0), 0) / perfExecutions.length) 
            : 0;

          const trendMap = new Map();
          perfExecutions.forEach(exec => {
            const dateStr = exec.execution_date;
            if (!trendMap.has(dateStr)) {
              trendMap.set(dateStr, { sum: 0, count: 0 });
            }
            const data = trendMap.get(dateStr);
            data.sum += (exec.progress_pct || 0);
            data.count += 1;
          });

          const trendData = Array.from(trendMap.entries())
            .map(([date, data]) => ({
              date: new Date(date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }).replace('/', '-'),
              rawDate: date,
              completion: Math.round(data.sum / data.count)
            }))
            .sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());

          return (
          <div className="animate-fade-in">
            {/* Filters Row */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
              <select 
                value={filterFarm}
                onChange={e => setFilterFarm(e.target.value)}
                style={{ padding: '0.5rem 1rem', backgroundColor: '#121212', border: '1px solid var(--border)', borderRadius: '20px', color: 'white', fontSize: '0.875rem', appearance: 'none', paddingRight: '2rem', backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right .7rem top 50%', backgroundSize: '.65rem auto' }}>
                <option value="All Farms">Semua Kandang</option>
                <option value="BBK">BBK</option>
                <option value="JTP">JTP</option>
              </select>
              <select 
                value={filterOperator}
                onChange={e => setFilterOperator(e.target.value)}
                style={{ padding: '0.5rem 1rem', backgroundColor: '#121212', border: '1px solid var(--border)', borderRadius: '20px', color: 'white', fontSize: '0.875rem', appearance: 'none', paddingRight: '2rem', backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right .7rem top 50%', backgroundSize: '.65rem auto' }}>
                <option value="All Operators">Semua Operator</option>
                {operators.map(op => <option key={op.id}>{op.name}</option>)}
              </select>
              <select 
                value={filterTimeRange}
                onChange={e => setFilterTimeRange(e.target.value)}
                style={{ padding: '0.5rem 1rem', backgroundColor: '#121212', border: '1px solid var(--border)', borderRadius: '20px', color: 'white', fontSize: '0.875rem', appearance: 'none', paddingRight: '2rem', backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right .7rem top 50%', backgroundSize: '.65rem auto' }}>
                <option value="Last 30 days">30 Hari Terakhir</option>
                <option value="Last 7 days">7 Hari Terakhir</option>
                <option value="This month">Bulan Ini</option>
              </select>
              
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                {perfExecutions.length} eksekusi
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Rata-rata Keseluruhan</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: filteredAvgCompletion < 50 ? 'rgb(239, 68, 68)' : filteredAvgCompletion < 80 ? 'rgb(234, 179, 8)' : 'var(--primary)' }}>{filteredAvgCompletion}%</div>
              </div>
              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Eksekusi</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--foreground)' }}>{perfExecutions.length}</div>
              </div>
              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Sempurna (100%)</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)' }}>{perfExecutions.filter(e => e.progress_pct === 100).length}</div>
              </div>
            </div>

            <div className="card" style={{ padding: '2rem', marginBottom: '2rem' }}>
              <h4 style={{ margin: '0 0 1.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Tren Tingkat Penyelesaian</h4>
              <div style={{ height: '250px', width: '100%' }}>
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#121212', border: '1px solid var(--border)', borderRadius: '8px' }}
                        itemStyle={{ color: 'var(--primary)', fontWeight: 600 }}
                      />
                      <Line type="monotone" dataKey="completion" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4, fill: '#121212', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                    Data tren tidak tersedia
                  </div>
                )}
              </div>
            </div>

            <div className="card" style={{ padding: '2rem', marginBottom: '2rem' }}>
              <h4 style={{ margin: '0 0 1.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Performa Operator</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {operators.filter(op => filterOperator === 'All Operators' || op.name === filterOperator).map((op, idx) => {
                  const opExecs = perfExecutions.filter(e => e.operator_id === op.id);
                  const runs = opExecs.length;
                  const avg = runs > 0 ? Math.round(opExecs.reduce((sum, e) => sum + (e.progress_pct || 0), 0) / runs) : 0;
                  const barColor = avg < 50 ? 'rgb(239, 68, 68)' : avg < 80 ? 'rgb(234, 179, 8)' : 'var(--primary)';

                  return (
                    <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '20px', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>{idx + 1}</div>
                      <div style={{ width: '150px', fontSize: '0.875rem', fontWeight: 600 }}>{op.name}</div>
                      <div style={{ flex: 1, height: '8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${avg}%`, height: '100%', backgroundColor: barColor }} />
                      </div>
                      <div style={{ width: '100px', textAlign: 'right', fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                        {runs} kali <span style={{ color: barColor, fontWeight: 700, marginLeft: '0.5rem' }}>{avg}%</span>
                      </div>
                      <button 
                        onClick={async () => {
                          if (window.confirm(`Apakah Anda yakin ingin menghapus operator ${op.name}?`)) {
                            const { error } = await supabase.from('operators').update({ is_active: false }).eq('id', op.id);
                            if (error) {
                              alert('Error deleting operator: ' + error.message);
                            } else {
                              fetchSopData();
                            }
                          }
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.5rem' }}
                        title="Hapus Operator"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
                {operators.length === 0 && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>Tidak ada data operator.</div>
                )}
              </div>
            </div>

            <div className="card" style={{ padding: '2rem' }}>
              <h4 style={{ margin: '0 0 1.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Rata-rata Penyelesaian per SOP</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {templates.map(template => {
                  const tmplExecs = perfExecutions.filter(e => e.template_id === template.id);
                  const runs = tmplExecs.length;
                  const avg = runs > 0 ? Math.round(tmplExecs.reduce((sum, e) => sum + (e.progress_pct || 0), 0) / runs) : 0;
                  const barColor = avg < 50 ? 'rgba(239, 68, 68, 0.8)' : avg < 80 ? 'rgba(234, 179, 8, 0.8)' : 'rgba(191, 245, 73, 0.8)';
                  
                  return (
                    <div key={template.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '150px', fontSize: '0.75rem', textAlign: 'right', color: 'var(--muted-foreground)' }}>
                        {template.title}
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: `${avg}%`, height: '24px', backgroundColor: barColor, borderRadius: '0 4px 4px 0', minWidth: avg > 0 ? '4px' : '0' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginLeft: '0.5rem' }}>{avg}%</span>
                      </div>
                    </div>
                  );
                })}
                {templates.length === 0 && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>Tidak ada data templat.</div>
                )}
                
                {/* X-axis labels */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                  <div style={{ width: '150px' }} />
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                    <span>0</span>
                    <span>25</span>
                    <span>50</span>
                    <span>75</span>
                    <span>100</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
}
