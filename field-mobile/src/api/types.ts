export type TodayStatus = 'not_checked_in' | 'checked_in' | 'checked_out';

export type Punch = {
  id?: number;
  punch_time: string;
  punch_type: string;
  device_id?: string | null;
  punch_source?: string | null;
  field_site_id?: number | null;
};

export type FieldSite = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
};

export type FieldUser = {
  user_id?: number;
  role: string;
  employee_id: number | null;
  company_id?: number | null;
  name?: string;
  email?: string;
};

export type MeResponse = {
  employee: {
    id: number;
    name: string;
    employee_code: string;
    attendance_channel: string;
    branch_id: number;
  };
  company: {
    id: number;
    name: string;
    mobile_attendance_enabled?: boolean;
    field_attendance_enabled?: boolean;
  };
  branch: { id: number; name: string };
  shift: { id: number; shift_name: string; start_time: string; end_time: string } | null;
  today: {
    status: TodayStatus;
    punches: Punch[];
    present?: boolean;
    late?: boolean;
  };
  sites: FieldSite[];
  enrolled: boolean;
  face: {
    model: string;
    dimension: number;
    match_threshold: number;
    embeddings: number[][];
    enrolled_at?: string;
  } | null;
};

export type PunchResult = {
  punch: Punch & { device_id: string };
  today: MeResponse['today'];
  site?: { id: number; name: string; distance_m: number };
};

export type MonthlyDay = {
  date: string;
  status?: string;
  present?: boolean;
};

export type MonthlySummary = {
  year: number;
  month: number;
  days: MonthlyDay[];
  summary: {
    present_days?: number;
    absent_days?: number;
    late_days?: number;
    overtime_hours?: number;
  } | null;
};

export type ApiError = Error & {
  code?: string;
  status?: number;
};
