import React, { createContext, useContext, useState, useEffect } from 'react';
import type { 
  ActivePage, 
  UserAccount, 
  ReconciliationRecord, 
  ReconciliationRun, 
  BusinessProfile, 
  ReconciliationSettings, 
  UploadedFileInfo, 
  ValidationSummary,
  BackendUploadSummary,
  BackendReconciliationResult,
  BackendReconciliationSummary,
  BackendReconciliationRunResponse,
  BackendJobDetail,
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
  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;
  backendJobs: BackendJobDetail[];
  backendUploadSummary: BackendUploadSummary | null;
  setBackendUploadSummary: (summary: BackendUploadSummary | null) => void;
  backendResults: BackendReconciliationResult[];
  setBackendResults: (results: BackendReconciliationResult[]) => void;
  backendSummary: BackendReconciliationSummary | null;
  setBackendSummary: (summary: BackendReconciliationSummary | null) => void;
  selectedBackendResult: BackendReconciliationResult | null;
  setSelectedBackendResult: (result: BackendReconciliationResult | null) => void;
  isReconciling: boolean;
  runReconciliationForActiveJob: (tolerance?: number) => Promise<BackendReconciliationRunResponse | null>;
  fetchBackendResults: (statusFilter?: string, search?: string) => Promise<BackendReconciliationResult[]>;
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
  
  // Real Backend Upload and Reconciliation State
  const [activeJobId, setActiveJobId] = useState<string | null>(() => {
    return localStorage.getItem('gstrecon_active_job_id');
  });
  const [backendJobs, setBackendJobs] = useState<BackendJobDetail[]>([]);
  const [backendUploadSummary, setBackendUploadSummary] = useState<BackendUploadSummary | null>(null);
  const [backendResults, setBackendResults] = useState<BackendReconciliationResult[]>([]);
  const [backendSummary, setBackendSummary] = useState<BackendReconciliationSummary | null>(null);
  const [selectedBackendResult, setSelectedBackendResult] = useState<BackendReconciliationResult | null>(null);
  const [isReconciling, setIsReconciling] = useState<boolean>(false);

  // Sync activeJobId to localStorage and strictly reset any stale previous job data
  const handleSetActiveJobId = (id: string | null) => {
    setActiveJobId(id);
    if (id) {
      localStorage.setItem('gstrecon_active_job_id', id);
    } else {
      localStorage.removeItem('gstrecon_active_job_id');
    }
    // Critical: Never allow previous job's summary, results or drawer selection to leak into a new upload
    setBackendSummary(null);
    setBackendResults([]);
    setSelectedBackendResult(null);
    setBackendUploadSummary(null);
  };

  // Upload State for fallback/sample files
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

      // Always fetch list of real backend reconciliation jobs
      let jobs: BackendJobDetail[] = [];
      try {
        jobs = await api.listJobs();
        setBackendJobs(jobs);
      } catch (e) {
        console.warn('Could not list backend jobs:', e);
      }

      // If activeJobId is not set or not in backend, pick latest job from backend
      let currentJobId = activeJobId;
      if (!currentJobId && jobs.length > 0) {
        currentJobId = jobs[0].id;
        setActiveJobId(currentJobId);
        localStorage.setItem('gstrecon_active_job_id', currentJobId);
      }

      // If activeJobId exists, fetch real backend details and results
      if (currentJobId) {
        try {
          const jobDetails = await api.getJobDetails(currentJobId);
          if (jobDetails.purchase_records_count !== undefined && jobDetails.gstr2b_records_count !== undefined) {
            setBackendUploadSummary({
              purchase_register_count: jobDetails.purchase_records_count,
              gstr2b_count: jobDetails.gstr2b_records_count,
              total_records: jobDetails.purchase_records_count + jobDetails.gstr2b_records_count,
            });
          }
          if (jobDetails.summary) {
            setBackendSummary(jobDetails.summary);
            const res = await api.getReconciliationResults(currentJobId);
            setBackendResults(res);
          } else {
            // Newly uploaded job that has NOT been reconciled yet
            setBackendSummary(null);
            setBackendResults([]);
          }
        } catch (err) {
          console.warn(`Job ${currentJobId} failed to load from backend:`, err);
          // If job was invalid / 404, fallback to newest existing job if available
          if (jobs.length > 0 && jobs[0].id !== currentJobId) {
            const fallbackId = jobs[0].id;
            setActiveJobId(fallbackId);
            localStorage.setItem('gstrecon_active_job_id', fallbackId);
          } else {
            setActiveJobId(null);
            localStorage.removeItem('gstrecon_active_job_id');
            setBackendSummary(null);
            setBackendResults([]);
            setBackendUploadSummary(null);
          }
        }
      } else {
        setBackendSummary(null);
        setBackendResults([]);
        setBackendUploadSummary(null);
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  };

  useEffect(() => {
    refreshData();
  }, [activeJobId]);

  const runReconciliationForActiveJob = async (tolerance = 1.0): Promise<BackendReconciliationRunResponse | null> => {
    if (!activeJobId) {
      showNotification('No uploaded job selected. Please upload files first.', 'error');
      return null;
    }
    setIsReconciling(true);
    try {
      const resp = await api.runReconciliation(activeJobId, tolerance);
      setBackendSummary(resp.summary);
      const results = await api.getReconciliationResults(activeJobId);
      setBackendResults(results);

      // Refresh jobs list so job status updates in background
      api.listJobs().then(setBackendJobs).catch(() => {});

      showNotification(
        `Reconciliation complete: ${resp.summary.matched} matched, ${resp.summary.mismatched} mismatched, ${resp.summary.total_missing} missing.`,
        'success'
      );
      return resp;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reconciliation execution failed.';
      showNotification(msg, 'error');
      throw err;
    } finally {
      setIsReconciling(false);
    }
  };

  const fetchBackendResults = async (statusFilter?: string, search?: string): Promise<BackendReconciliationResult[]> => {
    if (!activeJobId) return [];
    try {
      const results = await api.getReconciliationResults(activeJobId, { status: statusFilter, search });
      setBackendResults(results);
      return results;
    } catch (err: unknown) {
      console.error('Failed to fetch results:', err);
      return [];
    }
  };

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
    handleSetActiveJobId(null);
    setBackendResults([]);
    setBackendSummary(null);
    showNotification('Uploaded files and reconciliation results cleared', 'info');
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
        activeJobId,
        setActiveJobId: handleSetActiveJobId,
        backendJobs,
        backendUploadSummary,
        setBackendUploadSummary,
        backendResults,
        setBackendResults,
        backendSummary,
        setBackendSummary,
        selectedBackendResult,
        setSelectedBackendResult,
        isReconciling,
        runReconciliationForActiveJob,
        fetchBackendResults,
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
