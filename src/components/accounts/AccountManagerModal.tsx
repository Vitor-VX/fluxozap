import React, { useState } from 'react';
import { Check, Loader2, Pencil, Plus, QrCode, Smartphone, Star, Trash2, X } from 'lucide-react';
import { WhatsAppAccount } from '../../types/flow';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  accounts: WhatsAppAccount[];
  activeAccountId: string;
  onSelectAccount: (accountId: string) => void;
  onRefreshAccounts: () => void;
}

const colors = ['emerald', 'blue', 'purple', 'amber', 'rose', 'indigo'];

export const AccountManagerModal: React.FC<Props> = ({ isOpen, onClose, accounts, activeAccountId, onSelectAccount, onRefreshAccounts }) => {
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('emerald');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [connectingId, setConnectingId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [qrAccountName, setQrAccountName] = useState('');
  if (!isOpen) return null;

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível criar a instância.');
      setCreating(false); setName(''); setColor('emerald');
      setNotice(data.warning || 'Instância criada. Abra Configuração UazAPI para escanear o QR Code.');
      onRefreshAccounts();
      if (data.account?.id) onSelectAccount(data.account.id);
    } catch (e: any) { setError(e.message); } finally { setSubmitting(false); }
  };

  const update = async (id: string, body: any) => {
    const response = await fetch(`/api/accounts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar a linha.');
    onRefreshAccounts();
  };

  const remove = async (account: WhatsAppAccount, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm(`Remover “${account.name}” do FluxoZap? A instância remota da UazAPI não será apagada.`)) return;
    const response = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) return setError(data.error || 'Não foi possível remover a linha.');
    onRefreshAccounts();
    if (activeAccountId === account.id) onSelectAccount(accounts.find((item) => item.id !== account.id)?.id || '');
  };

  const reconnect = async (account: WhatsAppAccount, event: React.MouseEvent) => {
    event.stopPropagation();
    setConnectingId(account.id); setError(''); setNotice(''); setQrCode('');
    try {
      const response = await fetch(`/api/accounts/${account.id}/connect`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível gerar um novo QR Code.');
      const nextQrCode = data.instance?.qrcode || data.qrcode || '';
      if (!nextQrCode) throw new Error('A UazAPI iniciou a reconexão, mas ainda não retornou o QR Code. Tente novamente em alguns segundos.');
      setQrCode(nextQrCode);
      setQrAccountName(account.name);
      setNotice(`Novo QR Code gerado para “${account.name}”.`);
      onSelectAccount(account.id);
      onRefreshAccounts();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setConnectingId('');
    }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"><div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
    <div className="flex items-center justify-between border-b border-slate-100 p-5"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white"><Smartphone className="h-5 w-5" /></div><div><h2 className="font-bold text-slate-900">Linhas do WhatsApp</h2><p className="text-xs text-slate-500">Cada linha é uma instância isolada na UazAPI.</p></div></div><button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button></div>
    <div className="flex-1 space-y-5 overflow-y-auto p-6 text-xs">
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{notice}</div>}
      {qrCode && <div className="mx-auto max-w-sm rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center"><h3 className="mb-3 text-sm font-bold text-emerald-950">Conectar {qrAccountName}</h3><img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} alt={`QR Code de ${qrAccountName}`} className="mx-auto aspect-square w-full rounded-xl bg-white object-contain p-2" /><p className="mt-3 font-semibold text-emerald-900">WhatsApp → Aparelhos conectados → Conectar aparelho</p></div>}
      <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">Instâncias ({accounts.length})</h3>{!creating && <button onClick={() => { setCreating(true); setError(''); }} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white"><Plus className="h-3.5 w-3.5" /> Nova instância</button>}</div>
      <div className="space-y-2.5">{accounts.map((account) => {
        const selected = account.id === activeAccountId;
        const status = account.connectionStatus || 'disconnected';
        return <div key={account.id} onClick={() => onSelectAccount(account.id)} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 ${selected ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200'}`}>
          <div className="min-w-0"><div className="flex items-center gap-2">{editingId === account.id ? <input autoFocus value={editingName} onClick={(e) => e.stopPropagation()} onChange={(e) => setEditingName(e.target.value)} className="rounded-md border px-2 py-1 text-sm font-bold" /> : <strong className="truncate text-sm text-slate-900">{account.name}</strong>}{account.isDefault && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">Padrão</span>}<span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status === 'connected' ? 'bg-emerald-100 text-emerald-700' : status === 'connecting' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{status}</span></div><p className="mt-1 font-mono text-[11px] text-slate-500">{account.phoneNumber || 'Aguardando conexão'} · {account.uazapiInstanceId || account.phoneNumberId}</p></div>
          <div className="flex shrink-0 gap-1">{status !== 'connected' && <button onClick={(e) => reconnect(account, e)} disabled={connectingId === account.id} title="Reconectar e gerar novo QR Code" className="rounded-lg bg-emerald-100 p-1.5 text-emerald-700 disabled:opacity-50">{connectingId === account.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}</button>}{editingId === account.id ? <button onClick={async (e) => { e.stopPropagation(); try { await update(account.id, { name: editingName }); setEditingId(''); } catch (x: any) { setError(x.message); } }} className="rounded-lg p-1.5 text-emerald-700"><Check className="h-4 w-4" /></button> : <button onClick={(e) => { e.stopPropagation(); setEditingId(account.id); setEditingName(account.name); }} className="rounded-lg p-1.5 text-slate-400"><Pencil className="h-4 w-4" /></button>}{!account.isDefault && <button onClick={async (e) => { e.stopPropagation(); await update(account.id, { isDefault: true }); }} className="rounded-lg p-1.5 text-amber-600"><Star className="h-4 w-4" /></button>}<button onClick={(e) => remove(account, e)} className="rounded-lg p-1.5 text-rose-500"><Trash2 className="h-4 w-4" /></button></div>
        </div>;
      })}</div>
      {creating && <form onSubmit={create} className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4"><div className="flex items-center justify-between"><h4 className="flex items-center gap-2 font-bold"><QrCode className="h-4 w-4 text-emerald-600" /> Criar instância UazAPI</h4><button type="button" onClick={() => setCreating(false)}>Cancelar</button></div><label className="block font-semibold text-slate-700">Nome da linha<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Comercial 01" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label><div><p className="mb-2 font-semibold text-slate-700">Cor</p><div className="flex gap-2">{colors.map((item) => <button key={item} type="button" onClick={() => setColor(item)} style={{ backgroundColor: ({ emerald: '#10b981', blue: '#3b82f6', purple: '#a855f7', amber: '#f59e0b', rose: '#f43f5e', indigo: '#6366f1' } as Record<string, string>)[item] }} className={`h-6 w-6 rounded-full border-2 border-white ${color === item ? 'ring-2 ring-slate-400' : ''}`} aria-label={item} />)}</div></div><button disabled={submitting} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Criar e gerar QR Code</button></form>}
    </div>
    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 p-4"><p className="text-xs text-slate-500">Use Configuração UazAPI para ler o QR Code da linha selecionada.</p><button onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white">Concluir</button></div>
  </div></div>;
};
