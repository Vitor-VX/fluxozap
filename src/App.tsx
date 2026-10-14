import React, { useState, useEffect } from 'react';
import {
  Workflow,
  Users,
  Settings,
  Bot,
  Database,
  Terminal,
  Cloud,
  Unplug,
  BadgeDollarSign,
  Activity,
} from 'lucide-react';
import { FlowEditor } from './components/flow/FlowEditor';
import { MetaApiSettings } from './components/settings/MetaApiSettings';
import { XPagSettings } from './components/settings/XPagSettings';
import { MetaConversionsSettings } from './components/settings/MetaConversionsSettings';
import { ConversationsList } from './components/conversations/ConversationsList';
import { LogsViewer } from './components/logs/LogsViewer';
import { MongoDbSettings } from './components/database/MongoDbSettings';
import { R2StorageSettings } from './components/storage/R2StorageSettings';
import { ApiSpendTracker } from './components/analytics/ApiSpendTracker';
import { AccountHeaderSelector } from './components/accounts/AccountHeaderSelector';
import { AccountManagerModal } from './components/accounts/AccountManagerModal';
import { WhatsAppAccount } from './types/flow';
import { DollarSign } from 'lucide-react';

type ActiveTab = 'editor' | 'conversations' | 'costs' | 'logs' | 'mongodb' | 'r2' | 'settings' | 'xpag' | 'capi';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [hasErrors, setHasErrors] = useState(false);
  const [isMongoConnected, setIsMongoConnected] = useState(false);

  // WhatsApp accounts state
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('');
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data: WhatsAppAccount[] = await res.json();
        setAccounts(data);
        if (data.length === 0) {
          setActiveAccountId('');
          return;
        }
        if (activeAccountId && !data.some((account) => account.id === activeAccountId)) {
          const def = data.find((account) => account.isDefault) || data[0];
          setActiveAccountId(def.id);
          return;
        }
        if (data.length > 0 && !activeAccountId) {
          const def = data.find((a) => a.isDefault) || data[0];
          setActiveAccountId(def.id);
        }
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Poll for error state and MongoDB connection state
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const [logsRes, mongoRes] = await Promise.all([
          fetch('/api/logs?filter=errors'),
          fetch('/api/mongodb/status'),
        ]);

        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setHasErrors(logsData.logs && logsData.logs.length > 0);
        }

        if (mongoRes.ok) {
          const mongoData = await mongoRes.json();
          setIsMongoConnected(mongoData.status === 'connected');
        }
      } catch {
        // silent
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0];

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 text-slate-900 select-none overflow-hidden font-sans">
      {/* Top Bar following Top Bar Contract (3 Zones) */}
      <header className="h-14 bg-white border-b border-slate-200 px-5 flex items-center justify-between gap-4 shrink-0 z-20">
        {/* Zone 1: Brand Wordmark & WhatsApp Account Switcher */}
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold tracking-tight text-slate-900">FluxoZap</span>
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 hidden sm:inline">
                WhatsApp &amp; Ads
              </span>
            </div>
          </div>

          {/* WhatsApp Multi-Number Switcher */}
          {accounts.length > 0 && (
            <AccountHeaderSelector
              accounts={accounts}
              activeAccountId={activeAccountId}
              onSelectAccount={(id) => setActiveAccountId(id)}
              onOpenManageModal={() => setIsAccountModalOpen(true)}
            />
          )}
          {accounts.length === 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 cursor-pointer text-xs font-semibold"
              title="Validar o Phone Number ID na Meta"
            >
              <Unplug className="w-3.5 h-3.5" />
              <span>Nenhum número conectado</span>
            </button>
          )}
        </div>

        {/* Zone 2: Navigation Links (Single-Line Controls) */}
        <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'editor'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Workflow className="w-3.5 h-3.5 text-blue-600" />
            <span>Editor de Fluxo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('conversations')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'conversations'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-teal-600" />
            <span>Conversas &amp; Leads</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('costs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'costs'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            <span>Custos da API</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 relative ${
              activeTab === 'logs'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-amber-600" />
            <span>Logs da API</span>
            {hasErrors && (
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" title="Erros recentes detectados" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mongodb')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'mongodb'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            <span>MongoDB Atlas</span>
            {isMongoConnected ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Atlas conectado" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" title="Atlas desconectado" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('r2')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'r2'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 text-orange-600" />
            <span>Cloudflare R2</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('xpag')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'xpag'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BadgeDollarSign className="w-3.5 h-3.5 text-violet-600" />
            <span>Pagamentos XPag</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('capi')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'capi' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-blue-600" />
            <span>Meta Conversões</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'settings'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-slate-600" />
            <span>Configuração Meta API</span>
          </button>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          {activeTab !== 'conversations' ? (
            <button
              type="button"
              onClick={() => setActiveTab('conversations')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs transition-colors whitespace-nowrap shrink-0"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Ver Conversas &amp; Leads</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <Workflow className="w-3.5 h-3.5 text-blue-600" />
              <span>Voltar ao Editor</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'editor' && (
          <FlowEditor
            onFlowSaved={() => {}}
            accountId={activeAccountId}
            accountName={activeAccount?.name}
          />
        )}
        {activeTab === 'conversations' && (
          <ConversationsList accounts={accounts} activeAccountId={activeAccountId} />
        )}
        {activeTab === 'costs' && (
          <ApiSpendTracker accounts={accounts} activeAccountId={activeAccountId} />
        )}
        {activeTab === 'logs' && (
          <LogsViewer activeAccountId={activeAccountId} activeAccountName={activeAccount?.name} />
        )}
        {activeTab === 'mongodb' && <MongoDbSettings />}
        {activeTab === 'r2' && <R2StorageSettings />}
        {activeTab === 'xpag' && <XPagSettings />}
        {activeTab === 'capi' && <MetaConversionsSettings accountId={activeAccountId} accountName={activeAccount?.name} />}
        {activeTab === 'settings' && (
          <MetaApiSettings
            onOpenLogs={() => setActiveTab('logs')}
            onConnectionUpdated={fetchAccounts}
            activeAccountId={activeAccountId}
          />
        )}
      </main>

      {/* WhatsApp Accounts Management Modal */}
      <AccountManagerModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelectAccount={(id) => setActiveAccountId(id)}
        onRefreshAccounts={fetchAccounts}
      />
    </div>
  );
}
