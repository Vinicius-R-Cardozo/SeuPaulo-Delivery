import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminGuard } from '@/components/layout/ProtectedRoute';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminLogin } from '@/pages/admin/auth/AdminLogin';
import { Dashboard } from '@/pages/admin/Dashboard';
import { AdminOrders } from '@/pages/admin/Orders';
import { KitchenPrinter } from '@/pages/admin/KitchenPrinter';
import { MenuManager } from '@/pages/admin/MenuManager';
import { AdminDrivers } from '@/pages/admin/Drivers';
import { DriverApplications } from '@/pages/admin/DriverApplications';
import { AdminCustomers } from '@/pages/admin/Customers';
import { LegalDocuments } from '@/pages/admin/LegalDocuments';

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
        <Route path="impressora" element={<KitchenPrinter />} />
        <Route path="cardapio" element={<MenuManager />} />
        <Route path="entregadores" element={<AdminDrivers />} />
        <Route path="solicitacoes" element={<DriverApplications />} />
        <Route path="clientes" element={<AdminCustomers />} />
        <Route path="documentos-legais" element={<LegalDocuments />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
