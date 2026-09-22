import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminGuard } from '@/components/layout/ProtectedRoute';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminLogin } from '@/pages/admin/auth/AdminLogin';
import { Dashboard } from '@/pages/admin/Dashboard';
import { AdminOrders } from '@/pages/admin/Orders';
import { MenuManager } from '@/pages/admin/MenuManager';
import { AdminDrivers } from '@/pages/admin/Drivers';
import { DriverApplications } from '@/pages/admin/DriverApplications';
import { AdminCustomers } from '@/pages/admin/Customers';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLogin />} />
      <Route
        path="/"
        element={
          <AdminGuard>
            <AdminLayout />
          </AdminGuard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="pedidos" element={<AdminOrders />} />
        <Route path="cardapio" element={<MenuManager />} />
        <Route path="entregadores" element={<AdminDrivers />} />
        <Route path="solicitacoes" element={<DriverApplications />} />
        <Route path="clientes" element={<AdminCustomers />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
