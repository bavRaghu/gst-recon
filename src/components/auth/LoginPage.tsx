import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ShieldCheck, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useApp();
  const [email, setEmail] = useState('ramesh@omkarengg.in');
  const [password, setPassword] = useState('••••••••••••');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your business email');
      return;
    }
    setError('');
    setLoading(true);
    setTimeout(() => {
      login(email, password);
      setLoading(false);
    }, 400);
  };

  const handleForgotPassword = () => {
    setForgotPasswordSent(true);
    setTimeout(() => setForgotPasswordSent(false), 5000);
  };

  const fillDemoAccount = () => {
    setEmail('ramesh@omkarengg.in');
    setPassword('DemoPass123!');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        {/* Brand identity header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded bg-blue-700 text-white shadow-sm mb-3">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            GSTRecon
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            GST Invoice Reconciliation & Compliance for MSMEs
          </p>
        </div>

        {/* Login Box */}
        <div className="bg-white border border-slate-300 rounded shadow-sm p-6 sm:p-8">
          <div className="border-b border-slate-200 pb-3 mb-5">
            <h2 className="text-sm font-semibold text-slate-800">
              Sign In to Your Accounting Workspace
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your credentials to manage purchase registers and GSTR-2B.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {forgotPasswordSent && (
            <div className="mb-4 p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
              Password reset link sent to your registered email address.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label 
                htmlFor="email-address" 
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Registered Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email-address"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label 
                  htmlFor="account-password" 
                  className="block text-xs font-semibold text-slate-700"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="account-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white font-medium py-2.5 px-4 rounded text-xs flex items-center justify-center space-x-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>

          {/* Quick Demo Credentials */}
          <div className="mt-6 pt-4 border-t border-slate-200">
            <div className="bg-slate-50 border border-slate-200 rounded p-2.5 text-xs text-slate-600">
              <div className="font-semibold text-slate-700 flex items-center justify-between">
                <span>Demo MSME Account:</span>
                <button
                  type="button"
                  onClick={fillDemoAccount}
                  className="text-blue-700 hover:underline text-[11px] font-medium"
                >
                  Fill credentials
                </button>
              </div>
              <div className="mt-1 font-mono text-[11px] text-slate-500">
                User: ramesh@omkarengg.in | Role: Head of Accounts
              </div>
            </div>
          </div>
        </div>

        {/* Security & compliance reassurance footer */}
        <div className="text-center mt-6 text-[11px] text-slate-500">
          <p>Complies with GST Portal Rule 36(4) & Section 16(2)(aa) standards.</p>
          <p className="mt-0.5">Encrypted connection • Local invoice processing</p>
        </div>
      </div>
    </div>
  );
};
