import type { 
  ReconciliationRecord, 
  ReconciliationRun, 
  BusinessProfile, 
  ReconciliationSettings, 
  ValidationSummary, 
  VendorMessage,
  MatchStatus,
  BackendUploadResponse,
  BackendReconciliationRunResponse,
  BackendReconciliationResult,
  BackendProposalItem,
  BackendJobDetail,
} from '../types';
import { 
  mockBusinessProfile, 
  mockReconciliationSettings, 
  mockReconciliationRuns, 
  mockReconciliationRecords, 
  mockValidationSummary 
} from './mockData';

// Storage keys for persisting state during user actions
const STORAGE_KEYS = {
  RECORDS: 'gstrecon_records_v1',
  RUNS: 'gstrecon_runs_v1',
  PROFILE: 'gstrecon_profile_v1',
  SETTINGS: 'gstrecon_settings_v1',
};

function getStoredItem<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function setStoredItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Storage error:', err);
  }
}

// In-memory / localStorage data initialized from mockData
let currentRecords: ReconciliationRecord[] = getStoredItem(
  STORAGE_KEYS.RECORDS, 
  mockReconciliationRecords
);
let currentRuns: ReconciliationRun[] = getStoredItem(
  STORAGE_KEYS.RUNS, 
  mockReconciliationRuns
);
let currentProfile: BusinessProfile = getStoredItem(
  STORAGE_KEYS.PROFILE, 
  mockBusinessProfile
);
let currentSettings: ReconciliationSettings = getStoredItem(
  STORAGE_KEYS.SETTINGS, 
  mockReconciliationSettings
);

// Simulated network latency for realistic loading states
const delay = (ms = 350) => new Promise(res => setTimeout(res, ms));

/**
 * Service API layer structured for future FastAPI backend replacement.
 * All functions return Promises matching standard REST response contracts.
 */
export const api = {
  // Business Profile
  async getBusinessProfile(): Promise<BusinessProfile> {
    await delay(150);
    return { ...currentProfile };
  },

  async updateBusinessProfile(profile: Partial<BusinessProfile>): Promise<BusinessProfile> {
    await delay(250);
    currentProfile = { ...currentProfile, ...profile };
    setStoredItem(STORAGE_KEYS.PROFILE, currentProfile);
    return { ...currentProfile };
  },

  // Settings
  async getSettings(): Promise<ReconciliationSettings> {
    await delay(150);
    return { ...currentSettings };
  },

  async updateSettings(settings: Partial<ReconciliationSettings>): Promise<ReconciliationSettings> {
    await delay(250);
    currentSettings = { ...currentSettings, ...settings };
    setStoredItem(STORAGE_KEYS.SETTINGS, currentSettings);
    return { ...currentSettings };
  },

  // Reconciliation Runs
  async getReconciliationRuns(): Promise<ReconciliationRun[]> {
    await delay(200);
    return [...currentRuns];
  },

  async getLatestRun(): Promise<ReconciliationRun | undefined> {
    await delay(150);
    return currentRuns[0];
  },

  // Records & Results
  async getReconciliationRecords(params?: {
    status?: MatchStatus | 'all';
    search?: string;
    severity?: 'all' | 'exact' | 'minor' | 'major';
    discrepancyType?: string;
  }): Promise<ReconciliationRecord[]> {
    await delay(200);
    let records = [...currentRecords];

    if (params?.status && params.status !== 'all') {
      records = records.filter(r => r.matchStatus === params.status);
    }

    if (params?.severity && params.severity !== 'all') {
      records = records.filter(r => r.severity === params.severity);
    }

    if (params?.discrepancyType && params.discrepancyType !== 'all') {
      records = records.filter(r => r.discrepancyType === params.discrepancyType);
    }

    if (params?.search && params.search.trim()) {
      const q = params.search.toLowerCase().trim();
      records = records.filter(r => 
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.supplierGstin.toLowerCase().includes(q) ||
        r.supplierName.toLowerCase().includes(q)
      );
    }

    return records;
  },

  async getRecordById(id: string): Promise<ReconciliationRecord | undefined> {
    await delay(100);
    return currentRecords.find(r => r.id === id);
  },

  // Validation Summary
  async getValidationSummary(): Promise<ValidationSummary> {
    await delay(300);
    return { ...mockValidationSummary };
  },

  // Perform Reconciliation Runner
  async executeReconciliation(period: string): Promise<ReconciliationRun> {
    await delay(400);

    const newRun: ReconciliationRun = {
      id: `RUN-${Date.now().toString().slice(-6)}`,
      gstPeriod: period,
      runDate: new Date().toISOString().replace('T', ' ').slice(0, 16),
      totalInvoices: 148,
      matched: 122,
      minorDiscrepancies: 14,
      majorDiscrepancies: 8,
      unmatched: 4,
      totalTaxRisk: 94850,
      eligibleItc: 482600,
      status: 'Action Needed',
    };

    currentRuns = [newRun, ...currentRuns];
    setStoredItem(STORAGE_KEYS.RUNS, currentRuns);
    return newRun;
  },

  // Vendor Communications
  async sendVendorCommunication(
    recordId: string, 
    message: Omit<VendorMessage, 'id' | 'date'>
  ): Promise<ReconciliationRecord> {
    await delay(300);
    const index = currentRecords.findIndex(r => r.id === recordId);
    if (index === -1) throw new Error('Record not found');

    const newMessage: VendorMessage = {
      id: `MSG-${Date.now()}`,
      date: new Date().toISOString().replace('T', ' ').slice(0, 16),
      ...message,
    };

    const updated = {
      ...currentRecords[index],
      vendorCommunicationStatus: 'sent' as const,
      communicationHistory: [
        newMessage,
        ...(currentRecords[index].communicationHistory || []),
      ],
    };

    currentRecords[index] = updated;
    setStoredItem(STORAGE_KEYS.RECORDS, currentRecords);
    return updated;
  },

  // Update Status / Accept Discrepancy
  async acceptMinorDiscrepancy(recordId: string): Promise<ReconciliationRecord> {
    await delay(200);
    const index = currentRecords.findIndex(r => r.id === recordId);
    if (index === -1) throw new Error('Record not found');

    const updated = {
      ...currentRecords[index],
      matchStatus: 'matched' as const,
      severity: 'exact' as const,
      reason: 'Difference accepted by user within tolerance limits.',
    };

    currentRecords[index] = updated;
    setStoredItem(STORAGE_KEYS.RECORDS, currentRecords);
    return updated;
  },

  // Reset to default sample data
  resetSampleData(): void {
    currentRecords = [...mockReconciliationRecords];
    currentRuns = [...mockReconciliationRuns];
    currentProfile = { ...mockBusinessProfile };
    currentSettings = { ...mockReconciliationSettings };
    setStoredItem(STORAGE_KEYS.RECORDS, currentRecords);
    setStoredItem(STORAGE_KEYS.RUNS, currentRuns);
    setStoredItem(STORAGE_KEYS.PROFILE, currentProfile);
    setStoredItem(STORAGE_KEYS.SETTINGS, currentSettings);
  },

  // Real Backend Upload Integration
  async uploadReconciliationFiles(
    purchaseRegisterFile: File,
    gstr2bFile: File
  ): Promise<BackendUploadResponse> {
    const formData = new FormData();
    formData.append('purchase_register', purchaseRegisterFile);
    formData.append('gstr_2b', gstr2bFile);

    try {
      const response = await fetch('/api/reconciliation/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (data && data.errors) {
          return data as BackendUploadResponse;
        }
        return {
          success: false,
          message: data?.message || `Server responded with status ${response.status}`,
          errors: [
            {
              file_type: 'Upload',
              reason: data?.detail || data?.message || 'Server error occurred during upload',
            },
          ],
        };
      }

      return data as BackendUploadResponse;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error or server unreachable';
      return {
        success: false,
        message: 'Could not connect to the backend server. Please verify the backend is running.',
        errors: [
          {
            file_type: 'Network',
            reason: message,
          },
        ],
      };
    }
  },

  async listJobs(): Promise<BackendJobDetail[]> {
    const response = await fetch('/api/reconciliation/jobs');
    if (!response.ok) {
      throw new Error('Failed to fetch jobs list');
    }
    return response.json();
  },

  async getJobDetails(jobId: string): Promise<BackendJobDetail> {
    const response = await fetch(`/api/reconciliation/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch job ${jobId}`);
    }
    return response.json();
  },

  // Real Backend Reconciliation Run
  async runReconciliation(jobId: string, tolerance?: number): Promise<BackendReconciliationRunResponse> {
    const response = await fetch(`/api/reconciliation/${jobId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tolerance: tolerance ?? 1.0, run_ai_matching: true }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.detail || `Reconciliation failed with status ${response.status}`);
    }
    return response.json();
  },

  // Real Backend Reconciliation Results
  async getReconciliationResults(
    jobId: string, 
    params?: { status?: string; search?: string }
  ): Promise<BackendReconciliationResult[]> {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'all') {
      query.append('status_filter', params.status);
    }
    if (params?.search && params.search.trim()) {
      query.append('search', params.search.trim());
    }
    const qStr = query.toString() ? `?${query.toString()}` : '';
    const response = await fetch(`/api/reconciliation/${jobId}/results${qStr}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch reconciliation results for job ${jobId}`);
    }
    return response.json();
  },

  // Real Backend AI Proposals
  async getReconciliationProposals(jobId: string): Promise<BackendProposalItem[]> {
    const response = await fetch(`/api/reconciliation/${jobId}/proposals`);
    if (!response.ok) {
      throw new Error(`Failed to fetch reconciliation proposals for job ${jobId}`);
    }
    return response.json();
  },

  // Review (Confirm / Reject) AI Match Proposal
  async reviewProposal(
    jobId: string,
    proposalId: string,
    action: 'CONFIRM_MATCH' | 'REJECT_MATCH',
    notes?: string,
    reviewerName: string = 'Accountant'
  ): Promise<import('../types').BackendProposalReviewResponse> {
    const response = await fetch(`/api/reconciliation/${jobId}/proposals/${proposalId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, notes, reviewer_name: reviewerName }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to submit review' }));
      throw new Error(err.detail || 'Failed to submit review decision');
    }
    return response.json();
  },

  // Plain-English Discrepancy Explanation
  async getResultExplanation(
    jobId: string,
    resultId: string
  ): Promise<import('../types').BackendDiscrepancyExplanation> {
    const response = await fetch(`/api/reconciliation/${jobId}/results/${resultId}/explanation`);
    if (!response.ok) {
      throw new Error(`Failed to fetch discrepancy explanation for result ${resultId}`);
    }
    return response.json();
  },
};
