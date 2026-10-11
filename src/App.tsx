import React, { useState, useEffect } from 'react';
import {
  Workflow,
  MessageSquareCode,
  Users,
  Settings,
  Bot,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { FlowEditor } from './components/flow/FlowEditor';
import { WhatsAppSimulator } from './components/simulator/WhatsAppSimulator';
import { MetaApiSettings } from './components/settings/MetaApiSettings';
import { ConversationsList } from './components/conversations/ConversationsList';
import { LogsViewer } from './components/logs/LogsViewer';

type ActiveTab = 'editor' | 'simulator' | 'conversations' | 'logs' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [hasErrors, setHasErrors] = useState(false);

  // Poll for error state to alert user in the topbar
  useEffect(() => {
    const checkErrors = async () => {
      try {
        const res = await fetch('/api/logs?filter=errors');
        if (res.ok) {
          const data = await res.json();
          setHasErrors(data.logs && data.logs.length > 0);
        }
      } catch {
        // silent
      }
    };
    checkErrors();
    const interval = setInterval(checkErrors, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 text-slate-900 select-none overflow-hidden font-sans">
      {/* Top Bar following Top Bar Contract (3 Zones) */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 shrink-0 z-20">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <Bot className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold tracking-tight text-slate-900">FluxoZap</span>
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
              WhatsApp Cloud API
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links (Single-Line Controls) */}
        <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
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
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'simulator'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquareCode className="w-3.5 h-3.5 text-emerald-600" />
            <span>Simulador WhatsApp</span>
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
        <div className="flex items-center gap-3 shrink-0">
          {activeTab !== 'logs' ? (
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <Terminal className="w-3.5 h-3.5 text-amber-600" />
              <span>Ver Logs da API</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <Workflow className="w-3.5 h-3.5 text-blue-600" />
              <span>Voltar ao Editor</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'editor' && <FlowEditor onFlowSaved={() => {}} />}
        {activeTab === 'simulator' && <WhatsAppSimulator />}
        {activeTab === 'conversations' && <ConversationsList />}
        {activeTab === 'logs' && <LogsViewer />}
        {activeTab === 'settings' && <MetaApiSettings onOpenLogs={() => setActiveTab('logs')} />}
      </main>
    </div>
  );
}
