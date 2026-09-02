export type ApiError = Error & {
  code?: string;
  status?: number;
};

export type AdminUser = {
  id?: number;
  user_id?: number;
  company_id: number | null;
  name?: string;
  email: string;
  role: string;
  employee_id?: number | null;
  company_locale?: {
    country_code?: string;
    timezone?: string;
    currency?: string;
  } | null;
};

export type Company = {
  id: number;
  name: string;
  timezone?: string | null;
  country_code?: string | null;
  subscription_end_date?: string | null;
  is_active?: boolean;
};

export type OnBreakEmployee = {
  name: string;
  employee_code?: string;
  punched_out_at?: string | null;
  break_name?: string;
};

export type BranchSummary = {
  branch_id: number;
  branch_name: string;
  present: number;
  absent: number;
  late: number;
  total: number;
  present_pct: number;
};

export type TrendPoint = {
  date: string;
  label: string;
  present: number;
  total: number;
  pct: number;
};

export type DashboardSummary = {
  todayPresent: number;
  todayTotal: number;
  todayPct: number;
  todayAbsent: string[];
  todayOnLunch: OnBreakEmployee[];
  branchSummary: BranchSummary[];
  attendanceTrend: TrendPoint[];
};

export type Punch = {
  id?: number;
  punch_time: string;
  punch_type: string;
  device_id?: string | null;
};

export type DailyRow = {
  employee_id: number;
  name: string;
  employee_code?: string | null;
  branch_id?: number | null;
  branch_name?: string | null;
  present: boolean;
  shift_pending?: boolean;
  late: boolean;
  minutes_late?: number;
  first_in_time?: string | null;
  total_hours_from_shift_start?: number | null;
  total_hours_inside?: number | null;
  open_break_name?: string | null;
  left_during_lunch?: boolean;
  punches?: Punch[];
};

export type AttendanceFilter = 'all' | 'present' | 'absent' | 'late' | 'missing_out';
