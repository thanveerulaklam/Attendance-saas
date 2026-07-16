export type TodayStatus = 'not_checked_in' | 'checked_in' | 'checked_out';

export type Punch = {
  id?: number;
  punch_time: string;
  punch_type: string;
  device_id?: string | null;
  punch_source?: string | null;
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
    mobile_attendance_enabled: boolean;
  };
  branch: { id: number; name: string };
  shift: { id: number; shift_name: string; start_time: string; end_time: string } | null;
  today: {
    status: TodayStatus;
    punches: Punch[];
    present?: boolean;
    late?: boolean;
  };
};

export type PunchResult = {
  punch: Punch & { device_id: string };
  today: MeResponse['today'];
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
