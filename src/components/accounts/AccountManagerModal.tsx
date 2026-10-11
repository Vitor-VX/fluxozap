import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Check,
  Smartphone,
  ShieldCheck,
  Star,
  Copy,
  ExternalLink,
  Loader2,
  Radio,
} from 'lucide-react';
import { WhatsAppAccount } from '../../types/flow';

interface AccountManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: WhatsAppAccount[];
  activeAccountId: string;
  onSelectAccount: (accountId: string) => void;
  onRefreshAccounts: () => void;
}

const COLOR_OPTIONS = [
  { id: 'emerald', bg: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  { id: 'blue', bg: 'bg-blue-50 text-blue-700 border-blue-300' },
  { id: 'purple', bg: 'bg-purple-50 text-purple-700 border-purple-300' },
  { id: 'amber', bg: 'bg-amber-50 text-amber-700 border-amber-300' },
  { id: 'rose', bg: 'bg-rose-50 text-rose-700 border-rose-300' },
  { id: 'indigo', bg: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
];

export const AccountManagerModal: React.FC<AccountManagerModalProps> = ({
  isOpen,
  onClose,
  accounts,
  activeAccountId,
  onSelectAccount,
  onRefreshAccounts,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New account form state
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    phoneNumberId: '',
    wabaId: '',
    accessToken: '',
    color: 'emerald',
    isDefault: false,
  });

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phoneNumberId.trim()) {
      setError('Informe ao menos o Nome e o Phone Number ID da Meta.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsCreating(false);
        setFormData({
          name: '',
          phoneNumber: '',
          phoneNumberId: '',
          wabaId: '',
          accessToken: '',
          color: 'blue',
          isDefault: false,
        });
        onRefreshAccounts();
        if (data.account?.id) {
          onSelectAccount(data.account.id);
        }
      } else {
        setError(data.error || 'Erro ao cadastrar novo número de WhatsApp.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro de conexão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (accountId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (accounts.length <= 1) {
      alert('Você precisa ter pelo menos um número de WhatsApp cadastrado.');
      return;
    }

    if (!confirm('Tem certeza que deseja remover este número de WhatsApp e sua configuração?')) {
      return;
    }

    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' });
      if (res.ok) {
        onRefreshAccounts();
        if (activeAccountId === accountId) {
          const remaining = accounts.filter((a) => a.id !== accountId);
          if (remaining.length > 0) {
            onSelectAccount(remaining[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Error deleting account:', err);
    }
  };

  const handleSetDefault = async (accountId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/accounts/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      onRefreshAccounts();
    } catch (err) {
      console.error('Error setting default account:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Gerenciar Múltiplos Números do WhatsApp
              </h2>
              <p className="text-xs text-slate-500">
                Cada número possui seu próprio Phone Number ID, funil exclusivo e clientes separados
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              {error}
            </div>
          )}

          {/* List of existing numbers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800 text-sm">
                Números Conectados ({accounts.length})
              </h3>
              {!isCreating && (
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Número</span>
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {accounts.map((acc) => {
                const isSelected = acc.id === activeAccountId;
                return (
                  <div
                    key={acc.id}
                    onClick={() => onSelectAccount(acc.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                          acc.color === 'blue'
                            ? 'bg-blue-100 text-blue-700 border-blue-200'
                            : acc.color === 'purple'
                            ? 'bg-purple-100 text-purple-700 border-purple-200'
                            : acc.color === 'amber'
                            ? 'bg-amber-100 text-amber-700 border-amber-200'
                            : acc.color === 'rose'
                            ? 'bg-rose-100 text-rose-700 border-rose-200'
                            : acc.color === 'indigo'
                            ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                            : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        <Smartphone className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm truncate">
                            {acc.name}
                          </span>
                          {acc.isDefault && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] border border-slate-200">
                              Padrão
                            </span>
                          )}
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-semibold text-[10px] flex items-center gap-1 shadow-2xs">
                              <Check className="w-2.5 h-2.5" /> Ativo
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-slate-500 font-mono text-[11px]">
                          <span>{acc.phoneNumber || 'Sem telefone exibido'}</span>
                          <span>•</span>
                          <span>ID: {acc.phoneNumberId}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!acc.isDefault && (
                        <button
                          type="button"
                          onClick={(e) => handleSetDefault(acc.id, e)}
                          title="Definir como número padrão"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 cursor-pointer transition-colors"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}

                      {accounts.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(acc.id, e)}
                          title="Excluir este número"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Form to add a new WhatsApp number */}
          {isCreating && (
            <form
              onSubmit={handleCreate}
              className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-3.5 animate-in fade-in"
            >
              <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-emerald-600" />
                  Cadastrar Novo Número de WhatsApp
                </h4>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nome da Linha / Instância *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Comercial Vendas 2"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Número de Telefone Exibido
                  </label>
                  <input
                    type="text"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    placeholder="Ex: +55 11 98765-4321"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Meta Phone Number ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.phoneNumberId}
                    onChange={(e) => setFormData({ ...formData, phoneNumberId: e.target.value })}
                    placeholder="Ex: 1048591829104"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Localizado no painel Meta Developers &gt; WhatsApp &gt; Configuração da API.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    WABA ID (Opcional)
                  </label>
                  <input
                    type="text"
                    value={formData.wabaId}
                    onChange={(e) => setFormData({ ...formData, wabaId: e.target.value })}
                    placeholder="Ex: 849201948102"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Access Token Específico (Opcional)
                </label>
                <input
                  type="password"
                  value={formData.accessToken}
                  onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                  placeholder="Se deixar em branco, usará o Access Token global da configuração"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Color picker */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Cor de Identificação
                </label>
                <div className="flex gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: c.id })}
                      className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform ${
                        formData.color === c.id ? 'scale-125 ring-2 ring-slate-400' : ''
                      } ${
                        c.id === 'emerald'
                          ? 'bg-emerald-500 border-emerald-600'
                          : c.id === 'blue'
                          ? 'bg-blue-500 border-blue-600'
                          : c.id === 'purple'
                          ? 'bg-purple-500 border-purple-600'
                          : c.id === 'amber'
                          ? 'bg-amber-500 border-amber-600'
                          : c.id === 'rose'
                          ? 'bg-rose-500 border-rose-600'
                          : 'bg-indigo-500 border-indigo-600'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-2 text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Salvar Número</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <p>
            💡 Ao receber mensagens pelo webhook da Meta, o FluxoZap reconhece automaticamente o número de destino e executa seu respectivo funil!
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg cursor-pointer transition-colors shrink-0"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
