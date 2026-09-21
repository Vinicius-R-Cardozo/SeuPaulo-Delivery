import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';

import { Landing } from '@/pages/Landing';
import { CustomerLogin } from '@/pages/auth/CustomerLogin';
import { CustomerRegister } from '@/pages/auth/CustomerRegister';
import { ForgotPassword } from '@/pages/auth/ForgotPassword';
import { ResetPassword } from '@/pages/auth/ResetPassword';

import { CustomerLayout } from '@/components/layout/CustomerLayout';
import { Home } from '@/pages/customer/Home';
import { Menu } from '@/pages/customer/Menu';
import { ProductDetail } from '@/pages/customer/ProductDetail';
import { Cart } from '@/pages/customer/Cart';
import { Checkout } from '@/pages/customer/Checkout';
import { Orders } from '@/pages/customer/Orders';
import { OrderTracking } from '@/pages/customer/OrderTracking';
import { Addresses } from '@/pages/customer/Addresses';
import { Profile } from '@/pages/customer/Profile';

import { DriverLogin } from '@/pages/driver/auth/DriverLogin';
import { DriverRegister } from '@/pages/driver/auth/DriverRegister';
import { DriverLayout } from '@/components/layout/DriverLayout';
import { DriverHome } from '@/pages/driver/Home';
import { ActiveDelivery } from '@/pages/driver/ActiveDelivery';
import { DriverHistory } from '@/pages/driver/History';
import { DriverEarnings } from '@/pages/driver/Earnings';
import { DriverProfile } from '@/pages/driver/DriverProfile';

import { AdminLogin } from '@/pages/admin/auth/AdminLogin';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Dashboard } from '@/pages/admin/Dashboard';
import { AdminOrders } from '@/pages/admin/Orders';
import { MenuManager } from '@/pages/admin/MenuManager';
import { AdminDrivers } from '@/pages/admin/Drivers';
import { AdminCustomers } from '@/pages/admin/Customers';

export function App() {
  return (
    <Routes>
      {/* Landing / escolha de ambiente */}
      <Route path="/" element={<Landing />} />

      {/* ---------- Cliente ---------- */}
      <Route path="/login" element={<CustomerLogin />} />
      <Route path="/cadastro" element={<CustomerRegister />} />
      <Route path="/recuperar-senha" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute role="customer">
            <CustomerLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="cardapio" element={<Menu />} />
        <Route path="produto/:id" element={<ProductDetail />} />
        <Route path="carrinho" element={<Cart />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="pedidos" element={<Orders />} />
        <Route path="pedido/:id" element={<OrderTracking />} />
        <Route path="enderecos" element={<Addresses />} />
        <Route path="perfil" element={<Profile />} />
      </Route>

      {/* ---------- Entregador ---------- */}
      <Route path="/entregador/login" element={<DriverLogin />} />
      <Route path="/entregador/cadastro" element={<DriverRegister />} />
      <Route
        path="/entregador"
        element={
          <ProtectedRoute role="driver">
            <DriverLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DriverHome />} />
        <Route path="entrega/:id" element={<ActiveDelivery />} />
        <Route path="historico" element={<DriverHistory />} />
        <Route path="ganhos" element={<DriverEarnings />} />
        <Route path="perfil" element={<DriverProfile />} />
      </Route>

      {/* ---------- Administrador ---------- */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="pedidos" element={<AdminOrders />} />
        <Route path="cardapio" element={<MenuManager />} />
        <Route path="entregadores" element={<AdminDrivers />} />
        <Route path="clientes" element={<AdminCustomers />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
