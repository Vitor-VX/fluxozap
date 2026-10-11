import React, { useState, useRef, useEffect } from 'react';
import { Smartphone, ChevronDown, Plus, Check, Settings2 } from 'lucide-react';
import { WhatsAppAccount } from '../../types/flow';

interface AccountHeaderSelectorProps {
  accounts: WhatsAppAccount[];
  activeAccountId: string;
  onSelectAccount: (accountId: string) => void;
  onOpenManageModal: () => void;
}

export const AccountHeaderSelector: React.FC<AccountHeaderSelectorProps> = ({
  accounts,
  activeAccountId,
  onSelectAccount,
  onOpenManageModal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 cursor-pointer shadow-2xs transition-all text-xs"
        title="Trocar Linha / Número de WhatsApp"
      >
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            activeAccount?.color === 'blue'
              ? 'bg-blue-500'
              : activeAccount?.color === 'purple'
              ? 'bg-purple-500'
              : activeAccount?.color === 'amber'
              ? 'bg-amber-500'
              : activeAccount?.color === 'rose'
              ? 'bg-rose-500'
              : activeAccount?.color === 'indigo'
              ? 'bg-indigo-500'
              : 'bg-emerald-500'
          }`}
        />
        <Smartphone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <div className="flex items-baseline gap-1.5 max-w-[230px] truncate text-left">
          <span className="font-bold text-slate-800 truncate">
            {activeAccount?.name || 'WhatsApp Padrão'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
            {activeAccount?.phoneNumber || ''}
          </span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1.5 overflow-hidden animate-in fade-in duration-100">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
            Números de WhatsApp ({accounts.length})
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {accounts.map((acc) => {
              const isSelected = acc.id === activeAccountId;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    onSelectAccount(acc.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs cursor-pointer hover:bg-slate-50 transition-colors ${
                    isSelected ? 'bg-emerald-50/70 text-emerald-950 font-semibold' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        acc.color === 'blue'
                          ? 'bg-blue-500'
                          : acc.color === 'purple'
                          ? 'bg-purple-500'
                          : acc.color === 'amber'
                          ? 'bg-amber-500'
                          : acc.color === 'rose'
                          ? 'bg-rose-500'
                          : acc.color === 'indigo'
                          ? 'bg-indigo-500'
                          : 'bg-emerald-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs">{acc.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">
                        {acc.phoneNumber || `ID: ${acc.phoneNumberId}`}
                      </p>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-100 p-1.5 bg-slate-50/60 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenManageModal();
              }}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 hover:bg-emerald-100/60 cursor-pointer transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Gerenciar / Adicionar Números</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
