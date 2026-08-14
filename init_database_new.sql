-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Farms Table
CREATE TABLE IF NOT EXISTS public.farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  created_at timestamptz DEFAULT now()
);

-- 2. Kandang Table
CREATE TABLE IF NOT EXISTS public.kandang (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES public.farms(id) ON DELETE CASCADE,
  name text NOT NULL,
  populasi integer,
  populasi_last_updated date,
  google_file_id text,
  created_at timestamptz DEFAULT now()
);

-- 3. Weekly Production Table
CREATE TABLE IF NOT EXISTS public.weekly_production (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kandang_id uuid REFERENCES public.kandang(id) ON DELETE CASCADE,
  week_end_date date,
  usia_minggu integer,
  hd_actual numeric,
  hd_std numeric,
  egg_weight_actual numeric,
  egg_weight_std numeric,
  egg_mass_actual numeric,
  egg_mass_std numeric,
  fcr_actual numeric,
  fcr_std numeric,
  fcr_cum numeric,
  pakan_kg numeric,
  pakan_g_per_ekor_hr numeric,
  pakan_std numeric,
  deplesi_ekor integer,
  deplesi_cum integer,
  deplesi_pct numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE (kandang_id, week_end_date)
);

-- 4. Daily Production Table
CREATE TABLE IF NOT EXISTS public.daily_production (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kandang_id uuid REFERENCES public.kandang(id) ON DELETE CASCADE,
  tanggal date,
  usia_hari integer,
  usia_minggu integer,
  hd_actual numeric,
  hd_std numeric,
  egg_mass_actual numeric,
  egg_mass_std numeric,
  fcr_actual numeric,
  fcr_std numeric,
  pakan_kg_hr numeric,
  pakan_gr_ekor numeric,
  pakan_std numeric,
  deplesi_ekor integer,
  deplesi_pct numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE (kandang_id, tanggal)
);

-- 5. Gap Warnings Table
CREATE TABLE IF NOT EXISTS public.gap_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kandang_id uuid REFERENCES public.kandang(id) ON DELETE CASCADE,
  tanggal date,
  variable text NOT NULL,
  delta_type text,
  delta_value numeric,
  threshold numeric,
  severity text,
  comparison_mode text,
  week_date date,
  week_from date,
  week_to date,
  usia_minggu integer,
  usia_from integer,
  usia_to integer,
  actual_value numeric,
  reference_value numeric,
  change_value numeric,
  change_pct numeric,
  direction text,
  health_signal text,
  triggered boolean DEFAULT true,
  is_resolved boolean DEFAULT false,
  flagged_at timestamptz DEFAULT now(),
  UNIQUE (kandang_id, week_date, week_to, variable, comparison_mode),
  UNIQUE (kandang_id, tanggal, variable, delta_type)
);

-- 6. Chat Sessions Table
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kandang_id uuid REFERENCES public.kandang(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- 7. Chat Messages Table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  file_url text,
  created_at timestamptz DEFAULT now()
);

-- 8. Operators Table
CREATE TABLE IF NOT EXISTS public.operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  farm_id uuid REFERENCES public.farms(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 9. SOP Templates Table
CREATE TABLE IF NOT EXISTS public.sop_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  farm_id uuid REFERENCES public.farms(id) ON DELETE CASCADE,
  kandang_id uuid REFERENCES public.kandang(id) ON DELETE CASCADE,
  frequency text DEFAULT 'daily',
  tasks jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 10. SOP Executions Table
CREATE TABLE IF NOT EXISTS public.sop_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.sop_templates(id) ON DELETE CASCADE,
  operator_id uuid REFERENCES public.operators(id) ON DELETE SET NULL,
  kandang_id uuid REFERENCES public.kandang(id) ON DELETE CASCADE,
  execution_date date NOT NULL,
  progress_pct numeric DEFAULT 0,
  task_results jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);
