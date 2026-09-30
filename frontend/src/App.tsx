import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/common/Sidebar';
import { LoginPage } from './components/auth/LoginPage';
import { DashboardPage } from './components/dashboard/DashboardPage';
import { UploadDataPage } from './components/upload/UploadDataPage';
import { DataValidationPage } from './components/validation/DataValidationPage';
import { ReconciliationRunnerPage } from './components/reconciliation/ReconciliationRunnerPage';
import { ReconciliationResultsPage } from './components/results/ReconciliationResultsPage';
import { DiscrepanciesPage } from './components/discrepancies/DiscrepanciesPage';
import { VendorCommunicationPage } from './components/vendor/VendorCommunicationPage';
import { ReportsPage } from './components/reports/ReportsPage';
import { SettingsPage } from './components/settings/SettingsPage';

const MainLayout: React.FC = () => {
  const { user, activePage } = useApp();

  if (!user.isAuthenticated) {
    return <LoginPage />;
  }

  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'upload':
        return <UploadDataPage />;
      case 'validation':
        return <DataValidationPage />;
      case 'reconciliation':
        return <ReconciliationRunnerPage />;
      case 'results':
        return <ReconciliationResultsPage />;
      case 'discrepancies':
        return <DiscrepanciesPage />;
      case 'vendor':
        return <VendorCommunicationPage />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {renderActivePage()}
      </div>
    </div>
  );
};

export function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}

export default App;
