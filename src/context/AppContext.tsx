import React, { createContext, useContext, useState, useEffect } from 'react';
import type { 
  ActivePage, 
  UserAccount, 
  ReconciliationRecord, 
  ReconciliationRun, 
  BusinessProfile, 
  ReconciliationSettings, 
  UploadedFileInfo, 
  ValidationSummary 
} from '../types';
import { api } from '../services/api';

interface AppContextType {
  user: UserAccount;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
  selectedPeriod: string;
  setSelectedPeriod: (period: string) => void;
  runs: ReconciliationRun[];
  records: ReconciliationRecord[];
  refreshData: () => Promise<void>;
  selectedRecordForDetail: ReconciliationRecord | null;
  setSelectedRecordForDetail: (record: ReconciliationRecord | null) => void;
  selectedRecordForVendor: ReconciliationRecord | null;
  setSelectedRecordForVendor: (record: ReconciliationRecord | null) => void;
  uploadPrFile: UploadedFileInfo | null;
  upload2bFile: UploadedFileInfo | null;
  setUploadPrFile: (file: UploadedFileInfo | null) => void;
  setUpload2bFile: (file: UploadedFileInfo | null) => void;
  validationSummary: ValidationSummary | null;
  loadSampleFiles: () => void;
  clearUploads: () => void;
  businessProfile: BusinessProfile | null;
  updateBusinessProfile: (p: Partial<BusinessProfile>) => Promise<void>;
  settings: ReconciliationSettings | null;
  updateSettings: (s: Partial<ReconciliationSettings>) => Promise<void>;
  notification: { message: string; type: 'success' | 'info' | 'warning' | 'error' } | null;
  showNotification: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  acceptRecordDifference: (recordId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserAccount>(() => {
    const saved = localStorage.getItem('gstrecon_user_session');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    // Default authenticated for seamless MSME workflow testing, or allow toggle
    return {
      name: 'Ramesh Kulkarni',
      email: 'ramesh@omkarengg.in',
      role: 'Head of Accounts',
      isAuthenticated: true,
    };
  });

  const [activePage, setActivePage] = useState<ActivePage>('dashboard');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('September 2026');
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<ReconciliationRecord | null>(null);
  const [selectedRecordForVendor, setSelectedRecordForVendor] = useState<ReconciliationRecord | null>(null);
  
  // Upload State
  const [uploadPrFile, setUploadPrFile] = useState<UploadedFileInfo | null>({
    name: 'Purchase_Register_Sep_2026.xlsx',
    size: 248500,
    format: 'xlsx',
    recordCount: 148,
    uploadedAt: '2026-09-30 09:30',
    status: 'ready',
  });
  const [upload2bFile, setUpload2bFile] = useState<UploadedFileInfo | null>({
    name: 'GSTR2B_27AABCO4829K1ZX_092026.json',
    size: 312000,
    format: 'json',
    recordCount: 144,
    uploadedAt: '2026-09-30 09:32',
    status: 'ready',
  });
  
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [settings, setSettings] = useState<ReconciliationSettings | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'warning' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(prev => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const refreshData = async () => {
    try {
      const [fetchedRuns, fetchedRecords, fetchedProfile, fetchedSettings, fetchedValidation] = await Promise.all([
        api.getReconciliationRuns(),
        api.getReconciliationRecords(),
        api.getBusinessProfile(),
        api.getSettings(),
        api.getValidationSummary(),
      ]);
      setRuns(fetchedRuns);
      setRecords(fetchedRecords);
      setBusinessProfile(fetchedProfile);
      setSettings(fetchedSettings);
      setValidationSummary(fetchedValidation);
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const login = (email: string) => {
    const newUser: UserAccount = {
      name: 'Ramesh Kulkarni',
      email: email || 'ramesh@omkarengg.in',
      role: 'Head of Accounts',
      isAuthenticated: true,
    };
    setUser(newUser);
    localStorage.setItem('gstrecon_user_session', JSON.stringify(newUser));
    showNotification('Logged in successfully', 'success');
    return true;
  };

  const logout = () => {
    const loggedOut: UserAccount = {
      name: '',
      email: '',
      role: '',
      isAuthenticated: false,
    };
    setUser(loggedOut);
    localStorage.removeItem('gstrecon_user_session');
    showNotification('Logged out', 'info');
  };

  const loadSampleFiles = () => {
    setUploadPrFile({
      name: `Purchase_Register_${selectedPeriod.replace(' ', '_')}.xlsx`,
      size: 248500,
      format: 'xlsx',
      recordCount: 148,
      uploadedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      status: 'ready',
    });
    setUpload2bFile({
      name: `GSTR2B_27AABCO4829K1ZX_${selectedPeriod.replace(' ', '_')}.json`,
      size: 312000,
      format: 'json',
      recordCount: 144,
      uploadedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      status: 'ready',
    });
    showNotification('Sample GST records loaded successfully for testing', 'success');
  };

  const clearUploads = () => {
    setUploadPrFile(null);
    setUpload2bFile(null);
    showNotification('Uploaded files removed', 'info');
  };

  const updateBusinessProfile = async (p: Partial<BusinessProfile>) => {
    const updated = await api.updateBusinessProfile(p);
    setBusinessProfile(updated);
    showNotification('Business profile updated', 'success');
  };

  const updateSettings = async (s: Partial<ReconciliationSettings>) => {
    const updated = await api.updateSettings(s);
    setSettings(updated);
    showNotification('Reconciliation settings saved', 'success');
  };

  const acceptRecordDifference = async (recordId: string) => {
    await api.acceptMinorDiscrepancy(recordId);
    await refreshData();
    showNotification('Difference accepted within tolerance', 'success');
  };

  return (
    <AppContext.Provider
      value={{
        user,
        login,
        logout,
        activePage,
        setActivePage,
        selectedPeriod,
        setSelectedPeriod,
        runs,
        records,
        refreshData,
        selectedRecordForDetail,
        setSelectedRecordForDetail,
        selectedRecordForVendor,
        setSelectedRecordForVendor,
        uploadPrFile,
        upload2bFile,
        setUploadPrFile,
        setUpload2bFile,
        validationSummary,
        loadSampleFiles,
        clearUploads,
        businessProfile,
        updateBusinessProfile,
        settings,
        updateSettings,
        notification,
        showNotification,
        acceptRecordDifference,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
