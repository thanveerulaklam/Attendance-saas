import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layout/DashboardLayout';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import CompanySettingsPage from './pages/CompanySettingsPage';
import ShiftsPage from './pages/ShiftsPage';
import DevicesPage from './pages/DevicesPage';
import PayrollPage from './pages/PayrollPage';
import AdvancesPage from './pages/AdvancesPage';
import AttendancePage from './pages/AttendancePage';
import ReportsPage from './pages/ReportsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import EnquiriesPage from './pages/EnquiriesPage';
import AdminPage from './pages/AdminPage';

function RootRedirect() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings/company" element={<CompanySettingsPage />} />
            <Route path="/shifts" element={<ShiftsPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/advances" element={<AdvancesPage />} />
            <Route path="/enquiries" element={<EnquiriesPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
