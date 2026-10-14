import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Eye, EyeOff, Plus, RefreshCw, Save, Search, ShieldCheck } from 'lucide-react';

interface Props { accountId?: string; accountName?: string; }

interface FormState {
  enabled: boolean;
  businessManagerId: string;
  datasetId: string;
  accessToken: string;
  graphApiVersion: string;
  testEventCode: string;
  onlyAttributed: boolean;
  hasAccessToken: boolean;
}

const empty: FormState = {
  enabled: false, businessManagerId: '', datasetId: '', accessToken: '',
  graphApiVersion: 'v24.0', testEventCode: '', onlyAttributed: true, hasAccessToken: false,
};

interface DiscoveredPixel { id: string; name?: string; relationship?: 'owned' | 'shared'; is_unavailable?: boolean; }
interface DiscoveredBusiness { id: string; name?: string; verification_status?: string; pixels: DiscoveredPixel[]; warnings?: string[]; }

export const MetaConversionsSettings: React.FC<Props> = ({ accountId, accountName }) => {
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [businesses, setBusinesses] = useState<DiscoveredBusiness[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [creatingPixel, setCreatingPixel] = useState(false);
  const [newPixelName, setNewPixelName] = useState('');

  useEffect(() => {
    setNotice(null);
    setForm(empty);
    setBusinesses([]);
    setNewPixelName('');
    if (!accountId) return;
    setLoading(true);
    fetch(`/api/meta-capi/config?accountId=${encodeURIComponent(accountId)}`)
      .then((response) => response.json())
      .then((data) => setForm({ ...empty, ...data, accessToken: '' }))
      .catch((error) => setNotice({ ok: false, text: error.message }))
      .finally(() => setLoading(false));
  }, [accountId]);

  const update = (key: keyof FormState, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!accountId) return;
    setSaving(true); setNotice(null);
    try {
      const response = await fetch('/api/meta-capi/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, accountId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      setForm((current) => ({ ...current, accessToken: '', hasAccessToken: data.hasAccessToken }));
      setNotice({ ok: true, text: data.message });
    } catch (error: any) { setNotice({ ok: false, text: error.message }); }
    finally { setSaving(false); }
  };

  const test = async () => {
    if (!accountId) return;
    setTesting(true); setNotice(null);
    try {
      if (form.accessToken) await save();
      const response = await fetch('/api/meta-capi/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha na validação.');
      setNotice({ ok: true, text: data.message });
    } catch (error: any) { setNotice({ ok: false, text: error.message }); }
    finally { setTesting(false); }
  };

  const discoverAssets = async () => {
    if (!accountId) return;
    setDiscovering(true); setNotice(null);
    try {
      const response = await fetch('/api/meta-capi/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          accessToken: form.accessToken,
          graphApiVersion: form.graphApiVersion,
          businessManagerId: form.businessManagerId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(`${data.error || 'Não foi possível buscar os ativos.'}${data.hint ? ` ${data.hint}` : ''}`);
      const found = Array.isArray(data.businesses) ? data.businesses : [];
      setBusinesses(found);
      const selectedBusiness = found.find((item: DiscoveredBusiness) => item.id === form.businessManagerId) || found[0];
      if (selectedBusiness) {
        setForm((current) => ({
          ...current,
          businessManagerId: selectedBusiness.id,
          datasetId: selectedBusiness.pixels.some((pixel: DiscoveredPixel) => pixel.id === current.datasetId)
            ? current.datasetId
            : (selectedBusiness.pixels[0]?.id || current.datasetId),
        }));
      }
      const pixelCount = found.reduce((total: number, item: DiscoveredBusiness) => total + item.pixels.length, 0);
      setNotice({
        ok: found.length > 0,
        text: found.length > 0
          ? `${found.length} BM(s) e ${pixelCount} Pixel(s)/Dataset(s) encontrados.${data.warning ? ` ${data.warning}` : ''}`
          : 'O token foi aceito, mas nenhuma BM acessível foi encontrada. Você ainda pode informar os IDs manualmente.',
      });
    } catch (error: any) { setNotice({ ok: false, text: error.message }); }
    finally { setDiscovering(false); }
  };

  const createPixel = async () => {
    if (!accountId || !form.businessManagerId || !newPixelName.trim()) return;
    if (!window.confirm(`Criar o Pixel "${newPixelName.trim()}" na BM ${form.businessManagerId}? Essa ação será feita diretamente na Meta.`)) return;
    setCreatingPixel(true); setNotice(null);
    try {
      const response = await fetch('/api/meta-capi/pixels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          accessToken: form.accessToken,
          graphApiVersion: form.graphApiVersion,
          businessManagerId: form.businessManagerId,
          name: newPixelName.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível criar o Pixel.');
      const pixel: DiscoveredPixel = data.pixel;
      setBusinesses((current) => current.map((business) => business.id === form.businessManagerId
        ? { ...business, pixels: [...business.pixels.filter((item) => item.id !== pixel.id), pixel] }
        : business));
      setForm((current) => ({ ...current, datasetId: pixel.id }));
      setNewPixelName('');
      setNotice({ ok: true, text: data.message });
    } catch (error: any) { setNotice({ ok: false, text: error.message }); }
    finally { setCreatingPixel(false); }
  };

  const selectedBusiness = businesses.find((business) => business.id === form.businessManagerId);

  if (!accountId) return <div className="h-full grid place-items-center text-sm text-slate-500">Conecte e selecione uma linha do WhatsApp primeiro.</div>;

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-600" />Meta API de Conversões</h2>
          <p className="text-sm text-slate-500 mt-1">Configuração exclusiva de <strong>{accountName || accountId}</strong>. Uma venda XPag confirmada envia um evento Purchase ao Pixel/Dataset desta linha.</p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <p className="font-bold flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Atribuição de anúncios do WhatsApp</p>
          <p className="mt-1 leading-relaxed">O ID do anúncio identifica a campanha, mas a atribuição da compra usa o <code>ctwa_clid</code> recebido no webhook do clique. O FluxoZap passa a capturá-lo automaticamente para os novos leads.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
          <label className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <span><strong className="block text-sm">Ativar envio de compras</strong><span className="text-xs text-slate-500">Dispara somente após confirmação autenticada da XPag.</span></span>
            <input type="checkbox" checked={form.enabled} onChange={(e) => update('enabled', e.target.checked)} className="w-5 h-5 accent-blue-600" />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-xs font-semibold text-slate-700">ID da Business Manager (BM)
              <input value={form.businessManagerId} onChange={(e) => update('businessManagerId', e.target.value)} placeholder="123456789..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold text-slate-700">ID do Pixel / Dataset
              <input value={form.datasetId} onChange={(e) => update('datasetId', e.target.value)} placeholder="ID usado em /{dataset_id}/events" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
          </div>

          <label className="block text-xs font-semibold text-slate-700">Token de acesso da BM
            <div className="relative mt-1">
              <input type={showToken ? 'text' : 'password'} value={form.accessToken} onChange={(e) => update('accessToken', e.target.value)} placeholder={form.hasAccessToken ? 'Token salvo — deixe vazio para manter' : 'Cole o token de usuário do sistema'} className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm font-normal" />
              <button type="button" onClick={() => setShowToken((value) => !value)} className="absolute right-2 top-2 text-slate-500">{showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>
          </label>

          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-blue-950">Preenchimento automático pelo token</p>
                <p className="text-xs text-blue-800 mt-0.5">Busca as BMs e os Pixels próprios ou compartilhados que esse token consegue acessar.</p>
              </div>
              <button type="button" onClick={discoverAssets} disabled={discovering || (!form.accessToken && !form.hasAccessToken)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 flex items-center gap-2">
                {discovering ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {discovering ? 'Buscando...' : 'Buscar BMs e Pixels'}
              </button>
            </div>

            {businesses.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-xs font-semibold text-slate-700">Business Manager encontrada
                  <select
                    value={form.businessManagerId}
                    onChange={(event) => {
                      const business = businesses.find((item) => item.id === event.target.value);
                      setForm((current) => ({ ...current, businessManagerId: event.target.value, datasetId: business?.pixels[0]?.id || '' }));
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                  >
                    {businesses.map((business) => <option key={business.id} value={business.id}>{business.name || 'BM sem nome'} · {business.id}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-700">Pixel / Dataset encontrado
                  <select value={form.datasetId} onChange={(event) => update('datasetId', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                    <option value="">Selecione um Pixel</option>
                    {(selectedBusiness?.pixels || []).map((pixel) => <option key={pixel.id} value={pixel.id}>{pixel.name || 'Pixel sem nome'} · {pixel.id}{pixel.relationship === 'shared' ? ' (compartilhado)' : ''}</option>)}
                  </select>
                </label>
              </div>
            )}

            {form.businessManagerId && (
              <div className="flex flex-wrap items-end gap-2 border-t border-blue-200 pt-3">
                <label className="flex-1 min-w-56 text-xs font-semibold text-slate-700">Criar novo Pixel nesta BM
                  <input value={newPixelName} onChange={(event) => setNewPixelName(event.target.value)} placeholder="Ex.: FluxoZap Vendas" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" />
                </label>
                <button type="button" onClick={createPixel} disabled={creatingPixel || !newPixelName.trim() || (!form.accessToken && !form.hasAccessToken)} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-800 disabled:opacity-50 flex items-center gap-2">
                  {creatingPixel ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {creatingPixel ? 'Criando...' : 'Criar Pixel'}
                </button>
              </div>
            )}
            <p className="text-[11px] text-blue-800">Normalmente o token precisa de <code>business_management</code> para listar BMs e <code>ads_read</code>/<code>ads_management</code> para consultar ou criar ativos. Se a Meta bloquear, os campos manuais acima continuam funcionando.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-xs font-semibold text-slate-700">Versão da Graph API
              <input value={form.graphApiVersion} onChange={(e) => update('graphApiVersion', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold text-slate-700">Código de evento de teste (opcional)
              <input value={form.testEventCode} onChange={(e) => update('testEventCode', e.target.value)} placeholder="TEST12345" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.onlyAttributed} onChange={(e) => update('onlyAttributed', e.target.checked)} className="accent-blue-600" />Enviar somente quando houver <code>ctwa_clid</code> do anúncio</label>

          {notice && <div className={`rounded-lg border px-3 py-2 text-sm ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{notice.text}</div>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={test} disabled={testing || loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{testing ? 'Validando...' : 'Validar conexão'}</button>
            <button type="button" onClick={save} disabled={saving || loading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2">{saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{saving ? 'Salvando...' : 'Salvar configuração'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
