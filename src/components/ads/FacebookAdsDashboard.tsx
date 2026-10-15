import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, BarChart3, CheckCircle2, DollarSign, Eye, Loader2,
  MousePointerClick, RefreshCw, RotateCcw, ShoppingCart, Target,
} from 'lucide-react';

interface Props { accountId?: string; accountName?: string; onOpenSettings: () => void; }

interface Metrics {
  impressions: number; reach: number; clicks: number; spend: number; cpc: number; cpm: number;
  ctr: number; purchases: number; purchaseValue: number; costPerPurchase: number; roas: number;
}

interface Campaign {
  id: string; name: string; status: string; effective_status: string; objective?: string;
  daily_budget?: string; lifetime_budget?: string; metrics: Metrics;
}

interface Sale {
  externalId: string; method: string; amount: number; currency: string; status: string; paidAt?: string; createdAt: string;
  customer: { phoneNumber: string; name?: string };
  attribution: { adId?: string; ctwaClid: boolean };
  conversion: { status: string; sentAt?: string; eventId?: string; eventTime?: string; error?: string; response?: any; attempts?: any[] };
}

const metricCurrency = (value: number, currency = 'BRL') => new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0);
const integer = (value: number) => new Intl.NumberFormat('pt-BR').format(value || 0);
const PAGE_SIZE = 10;
const ADS_DATE_PRESET_KEY = 'fluxozap:facebook-ads:date-preset';
const ADS_CAMPAIGN_FILTER_KEY = 'fluxozap:facebook-ads:campaign-filter';
const validDatePresets = new Set(['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month', 'maximum']);
const validCampaignFilters = new Set(['all', 'active', 'inactive']);

const readStoredPreference = <T extends string>(key: string, validValues: Set<string>, fallback: T): T => {
  try {
    const stored = window.localStorage.getItem(key);
    return stored && validValues.has(stored) ? stored as T : fallback;
  } catch {
    return fallback;
  }
};

const conversionLabel: Record<string, { label: string; classes: string }> = {
  sent: { label: 'Recebida pela Meta', classes: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Falhou', classes: 'bg-rose-100 text-rose-800' },
  not_attributed: { label: 'Sem atribuição', classes: 'bg-amber-100 text-amber-800' },
  disabled: { label: 'CAPI desativada', classes: 'bg-slate-100 text-slate-600' },
  pending: { label: 'Pendente', classes: 'bg-blue-100 text-blue-800' },
  not_applicable: { label: 'Pagamento não confirmado', classes: 'bg-slate-100 text-slate-600' },
};

export const FacebookAdsDashboard: React.FC<Props> = ({ accountId, accountName, onOpenSettings }) => {
  const [tab, setTab] = useState<'campaigns' | 'sales'>('campaigns');
  const [datePreset, setDatePreset] = useState(() => readStoredPreference(ADS_DATE_PRESET_KEY, validDatePresets, 'last_30d'));
  const [ads, setAds] = useState<any>(null);
  const [salesData, setSalesData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatingCampaign, setUpdatingCampaign] = useState<string | null>(null);
  const [retryingSale, setRetryingSale] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'active' | 'inactive'>(() => readStoredPreference(ADS_CAMPAIGN_FILTER_KEY, validCampaignFilters, 'all'));
  const [visibleCampaigns, setVisibleCampaigns] = useState(PAGE_SIZE);
  const [visibleSales, setVisibleSales] = useState(PAGE_SIZE);

  const load = async () => {
    if (!accountId) return;
    setLoading(true); setError('');
    try {
      const [adsResponse, salesResponse] = await Promise.all([
        fetch(`/api/facebook-ads/dashboard?accountId=${encodeURIComponent(accountId)}&datePreset=${encodeURIComponent(datePreset)}`),
        fetch(`/api/meta-capi/sales?accountId=${encodeURIComponent(accountId)}`),
      ]);
      const [adsPayload, salesPayload] = await Promise.all([adsResponse.json(), salesResponse.json()]);
      if (!adsResponse.ok) throw new Error(adsPayload.error || 'Não foi possível consultar o Facebook Ads.');
      if (!salesResponse.ok) throw new Error(salesPayload.error || 'Não foi possível carregar as vendas.');
      setAds(adsPayload); setSalesData(salesPayload);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [accountId, datePreset]);

  useEffect(() => {
    try { window.localStorage.setItem(ADS_DATE_PRESET_KEY, datePreset); } catch { /* storage unavailable */ }
  }, [datePreset]);

  useEffect(() => {
    try { window.localStorage.setItem(ADS_CAMPAIGN_FILTER_KEY, campaignFilter); } catch { /* storage unavailable */ }
  }, [campaignFilter]);

  useEffect(() => {
    setVisibleCampaigns(PAGE_SIZE);
    setVisibleSales(PAGE_SIZE);
  }, [accountId]);

  useEffect(() => { setVisibleCampaigns(PAGE_SIZE); }, [campaignFilter, datePreset]);

  const toggleCampaign = async (campaign: Campaign) => {
    if (!accountId) return;
    const nextStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    if (!window.confirm(`${nextStatus === 'ACTIVE' ? 'Ativar' : 'Pausar'} a campanha "${campaign.name}" diretamente na Meta?`)) return;
    setUpdatingCampaign(campaign.id); setError('');
    try {
      const response = await fetch(`/api/facebook-ads/campaigns/${encodeURIComponent(campaign.id)}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, status: nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'A Meta recusou a alteração.');
      setAds((current: any) => ({ ...current, campaigns: current.campaigns.map((item: Campaign) => item.id === campaign.id ? { ...item, status: nextStatus, effective_status: nextStatus } : item) }));
    } catch (err: any) { setError(err.message); }
    finally { setUpdatingCampaign(null); }
  };

  const retryConversion = async (sale: Sale) => {
    if (!accountId) return;
    setRetryingSale(sale.externalId); setError('');
    try {
      const response = await fetch(`/api/meta-capi/sales/${encodeURIComponent(sale.externalId)}/retry`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Não foi possível reenviar.');
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setRetryingSale(null); }
  };

  const campaigns: Campaign[] = ads?.campaigns || [];
  const totals: Metrics | null = ads?.totals || null;
  const currency = ads?.account?.currency || 'BRL';
  const sales: Sale[] = salesData?.sales || [];
  const filteredCampaigns = useMemo(() => campaigns.filter((campaign) => {
    const isActive = campaign.status === 'ACTIVE' && campaign.effective_status === 'ACTIVE';
    if (campaignFilter === 'active') return isActive;
    if (campaignFilter === 'inactive') return !isActive;
    return true;
  }), [campaigns, campaignFilter]);
  const displayedCampaigns = filteredCampaigns.slice(0, visibleCampaigns);
  const displayedSales = sales.slice(0, visibleSales);
  const revenueText = useMemo(() => Object.entries(salesData?.summary?.revenueByCurrency || {}).map(([code, value]) => metricCurrency(Number(value), code)).join(' + ') || metricCurrency(0), [salesData]);

  if (!accountId) return <div className="h-full grid place-items-center text-sm text-slate-500">Selecione uma linha do WhatsApp.</div>;

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><BarChart3 className="w-5 h-5 text-blue-600" />Facebook Ads &amp; Vendas</h2>
            <p className="mt-1 text-sm text-slate-500">Linha: <strong>{accountName || accountId}</strong>{ads?.account?.name ? ` · ${ads.account.name}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={datePreset} onChange={(event) => setDatePreset(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">
              <option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="last_7d">Últimos 7 dias</option><option value="last_14d">Últimos 14 dias</option><option value="last_30d">Últimos 30 dias</option><option value="this_month">Este mês</option><option value="last_month">Mês passado</option><option value="maximum">Todo o período</option>
            </select>
            <button type="button" onClick={load} disabled={loading} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>

        {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

        {ads && !ads.configured ? (
          <div className="rounded-2xl border border-dashed border-blue-300 bg-white p-10 text-center">
            <Target className="mx-auto w-10 h-10 text-blue-500" />
            <h3 className="mt-3 text-base font-bold text-slate-900">Conecte sua conta de anúncios</h3>
            <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">Configure o token, a conta de anúncios e o Pixel na aba Meta Conversões. Sem essas credenciais, nenhuma métrica é consultada.</p>
            <button type="button" onClick={onOpenSettings} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Abrir Meta Conversões</button>
          </div>
        ) : (
          <>
            <div className="inline-flex rounded-xl bg-slate-200/70 p-1">
              <button onClick={() => setTab('campaigns')} className={`rounded-lg px-4 py-2 text-xs font-bold ${tab === 'campaigns' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}>Campanhas e métricas</button>
              <button onClick={() => setTab('sales')} className={`rounded-lg px-4 py-2 text-xs font-bold ${tab === 'sales' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}>Vendas e API de Conversões</button>
            </div>

            {tab === 'campaigns' && (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                  {[
                    ['Investimento', metricCurrency(totals?.spend || 0, currency), DollarSign], ['Impressões', integer(totals?.impressions || 0), Eye],
                    ['Cliques', integer(totals?.clicks || 0), MousePointerClick], ['CTR', `${(totals?.ctr || 0).toFixed(2)}%`, Activity],
                    ['CPC', metricCurrency(totals?.cpc || 0, currency), DollarSign], ['CPM', metricCurrency(totals?.cpm || 0, currency), BarChart3],
                    ['Compras Meta', integer(totals?.purchases || 0), ShoppingCart], ['ROAS', `${(totals?.roas || 0).toFixed(2)}x`, Target],
                  ].map(([label, value, Icon]: any) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs"><Icon className="w-4 h-4 text-blue-600" /><p className="mt-2 text-[10px] font-semibold uppercase text-slate-400">{label}</p><p className="mt-0.5 text-sm font-bold text-slate-900">{value}</p></div>)}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Filtrar campanhas</p>
                    <p className="text-[10px] text-slate-500">{filteredCampaigns.length} de {campaigns.length} campanhas</p>
                  </div>
                  <div className="inline-flex rounded-lg bg-slate-100 p-1">
                    {([
                      ['all', 'Todas'], ['active', 'Ativas'], ['inactive', 'Desativadas'],
                    ] as const).map(([value, label]) => (
                      <button key={value} type="button" onClick={() => setCampaignFilter(value)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${campaignFilter === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                  <div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase text-slate-500 shadow-[0_1px_0_0_#e2e8f0]"><tr><th className="p-3">Campanha</th><th className="p-3">Status</th><th className="p-3 text-right">Gasto</th><th className="p-3 text-right">Impressões</th><th className="p-3 text-right">Cliques</th><th className="p-3 text-right">CPC</th><th className="p-3 text-right">CPM</th><th className="p-3 text-right">Compras</th><th className="p-3 text-right">ROAS</th><th className="p-3 text-center">Ligada</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{displayedCampaigns.map((campaign) => { const isEffectivelyActive = campaign.effective_status === 'ACTIVE'; const isEnabled = campaign.status === 'ACTIVE'; return <tr key={campaign.id} className="hover:bg-slate-50"><td className="p-3"><p className="font-bold text-slate-900">{campaign.name}</p><p className="font-mono text-[10px] text-slate-400">{campaign.id} · {campaign.objective || 'sem objetivo'}</p></td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${isEffectivelyActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{campaign.effective_status}</span></td><td className="p-3 text-right">{metricCurrency(campaign.metrics.spend, currency)}</td><td className="p-3 text-right">{integer(campaign.metrics.impressions)}</td><td className="p-3 text-right">{integer(campaign.metrics.clicks)}</td><td className="p-3 text-right">{metricCurrency(campaign.metrics.cpc, currency)}</td><td className="p-3 text-right">{metricCurrency(campaign.metrics.cpm, currency)}</td><td className="p-3 text-right font-bold">{integer(campaign.metrics.purchases)}</td><td className="p-3 text-right font-bold">{campaign.metrics.roas.toFixed(2)}x</td><td className="p-3"><div className="flex justify-center"><button type="button" role="switch" aria-checked={isEnabled} aria-label={`${isEnabled ? 'Pausar' : 'Ativar'} campanha ${campaign.name}`} onClick={() => toggleCampaign(campaign)} disabled={updatingCampaign === campaign.id} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`} title={isEnabled ? 'Pausar campanha' : 'Ativar campanha'}><span className={`absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow-sm transition-transform ${isEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}>{updatingCampaign === campaign.id && <Loader2 className="h-3 w-3 animate-spin text-slate-500" />}</span></button></div></td></tr>; })}</tbody></table></div>
                  {!loading && filteredCampaigns.length === 0 && <div className="p-10 text-center text-sm text-slate-500">{campaigns.length === 0 ? 'Nenhuma campanha retornada para esta conta.' : 'Nenhuma campanha corresponde a este filtro.'}</div>}
                  {visibleCampaigns < filteredCampaigns.length && <div className="border-t border-slate-100 p-3 text-center"><button type="button" onClick={() => setVisibleCampaigns((current) => current + PAGE_SIZE)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Mostrar mais 10 <span className="font-normal text-slate-400">({filteredCampaigns.length - visibleCampaigns} restantes)</span></button></div>}
                </div>
              </>
            )}

            {tab === 'sales' && (
              <>
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
                  “Recebida pela Meta” confirma que o Dataset recebeu o evento. A compra só fica atribuída quando também aparece nos Insights da campanha.
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {[
                    ['Receita confirmada', revenueText], ['Pagamentos', integer(salesData?.summary?.payments || 0)], ['Confirmados', integer(salesData?.summary?.confirmed || 0)],
                    ['Enviados à Meta', integer(salesData?.summary?.sent || 0)], ['Com problema', integer(salesData?.summary?.failed || 0)],
                  ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-semibold uppercase text-slate-400">{label}</p><p className="mt-1 text-base font-bold text-slate-900">{value}</p></div>)}
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"><div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase text-slate-500 shadow-[0_1px_0_0_#e2e8f0]"><tr><th className="p-3">Cliente/Venda</th><th className="p-3">Pagamento</th><th className="p-3">Anúncio</th><th className="p-3">Conversão Meta</th><th className="p-3">Detalhes</th><th className="p-3"></th></tr></thead><tbody className="divide-y divide-slate-100">
                  {displayedSales.map((sale) => { const badge = conversionLabel[sale.conversion.status] || conversionLabel.not_applicable; return <tr key={sale.externalId} className="align-top hover:bg-slate-50"><td className="p-3"><p className="font-bold text-slate-900">{sale.customer.name || sale.customer.phoneNumber}</p><p className="font-mono text-[10px] text-slate-400">{sale.customer.phoneNumber}<br />{sale.externalId}</p></td><td className="p-3"><p className="font-bold">{metricCurrency(sale.amount, sale.currency)}</p><p className="text-[10px] text-slate-500">{sale.method} · {sale.status}</p></td><td className="p-3"><p className="font-mono text-[10px]">{sale.attribution.adId || 'Sem anúncio'}</p><p className={`text-[10px] ${sale.attribution.ctwaClid ? 'text-emerald-700' : 'text-amber-700'}`}>{sale.attribution.ctwaClid ? 'ctwa_clid capturado' : 'sem ctwa_clid'}</p></td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${badge.classes}`}>{badge.label}</span>{sale.conversion.sentAt && <p className="mt-1 text-[10px] text-slate-500">Enviada: {new Date(sale.conversion.sentAt).toLocaleString('pt-BR')}</p>}{sale.conversion.eventTime && <p className="text-[10px] text-slate-500">Evento: {new Date(sale.conversion.eventTime).toLocaleString('pt-BR')}</p>}</td><td className="max-w-xs p-3"><p className="break-words text-[10px] text-rose-700">{sale.conversion.error}</p>{sale.conversion.eventId && <p className="break-all font-mono text-[9px] text-slate-400">event_id: {sale.conversion.eventId}</p>}{sale.conversion.response?.events_received !== undefined && <p className="text-[10px] text-emerald-700">events_received: {sale.conversion.response.events_received}</p>}{sale.conversion.attempts && sale.conversion.attempts.length > 1 && <p className="text-[10px] text-amber-700">{sale.conversion.attempts.length} tentativas registradas</p>}</td><td className="p-3">{['failed', 'not_attributed', 'pending'].includes(sale.conversion.status) && sale.status === 'confirmed' && <button type="button" onClick={() => retryConversion(sale)} disabled={retryingSale === sale.externalId} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600" title="Reenviar conversão">{retryingSale === sale.externalId ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}</button>}</td></tr>; })}
                </tbody></table></div>{!loading && sales.length === 0 && <div className="p-10 text-center text-sm text-slate-500">Nenhuma cobrança registrada nesta linha.</div>}{visibleSales < sales.length && <div className="border-t border-slate-100 p-3 text-center"><button type="button" onClick={() => setVisibleSales((current) => current + PAGE_SIZE)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Mostrar mais 10 <span className="font-normal text-slate-400">({sales.length - visibleSales} restantes)</span></button></div>}</div>
              </>
            )}
          </>
        )}
        {loading && !ads && <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div>}
      </div>
    </div>
  );
};
