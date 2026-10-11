import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Percent,
  Sparkles,
  Calculator,
  RefreshCw,
  Info,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { ApiCostAnalytics, WhatsAppAccount } from '../../types/flow';

interface ApiSpendTrackerProps {
  accounts: WhatsAppAccount[];
  activeAccountId?: string;
}

export const ApiSpendTracker: React.FC<ApiSpendTrackerProps> = ({ accounts }) => {
  const [data, setData] = useState<ApiCostAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [customRate, setCustomRate] = useState<number>(5.65);
  const [isEditingRate, setIsEditingRate] = useState(false);

  // Budget Simulator state
  const [simLeads, setSimLeads] = useState<number>(1000);
  const [simCategory, setSimCategory] = useState<'marketing' | 'utility' | 'authentication' | 'service'>('marketing');

  const fetchCostData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/costs?exchangeRate=${customRate}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Error fetching cost data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCostData();
  }, [customRate]);

  // Pricing rates reference
  const PRICING = {
    marketing: 0.0625,
    utility: 0.035,
    authentication: 0.0315,
    service: 0.03,
  };

  const simCostUsd = simLeads * PRICING[simCategory];
  const simCostBrl = simCostUsd * customRate;

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-y-auto">
      {/* Top Banner */}
      <div className="p-6 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1 rounded-lg bg-emerald-100 text-emerald-700">
                <DollarSign className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold text-slate-900">
                Gestão de Custos &amp; Gastos da Meta WhatsApp API
              </h1>
            </div>
            <p className="text-xs text-slate-500 max-w-2xl">
              Monitore o consumo das janelas de atendimento da Meta Cloud API (24h padrão vs 72h gratuitas de anúncios do Facebook Ads), franquia gratuita mensal e previsão de faturamento.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Exchange rate controller */}
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">Cotação USD:</span>
              {isEditingRate ? (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">R$</span>
                  <input
                    type="number"
                    step="0.05"
                    value={customRate}
                    onChange={(e) => setCustomRate(parseFloat(e.target.value) || 5.65)}
                    onBlur={() => setIsEditingRate(false)}
                    autoFocus
                    className="w-16 px-1 py-0.5 bg-white border border-slate-300 rounded font-mono text-xs text-slate-900"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingRate(true)}
                  className="font-mono font-bold text-slate-800 hover:text-emerald-700 cursor-pointer"
                  title="Clique para editar a taxa de câmbio"
                >
                  R$ {customRate.toFixed(2)} ✏️
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={fetchCostData}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Atualizar Custos</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Dashboard Content */}
      <div className="max-w-6xl mx-auto w-full p-6 space-y-6 flex-1">
        {/* KPI Cards (4 Top Metrics) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1: Gasto Total */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-semibold">Gasto Total Acumulado</span>
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-slate-900">
                ${data ? data.totalSpendUsd.toFixed(2) : '0.00'}
              </span>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md ml-2 border border-emerald-200">
                R$ {data ? data.totalSpendBrl.toFixed(2) : '0.00'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Cobrança oficial da Meta Graph API para a WABA
            </p>
          </div>

          {/* 2: Franquia Gratuita Meta (1.000 mensais) */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-semibold">Franquia Gratuita Mensal</span>
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900">
                {data ? data.freeTierUsed : 0}
              </span>
              <span className="text-xs text-slate-400 font-medium">/ 1.000 gratuitas</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2.5 overflow-hidden">
              <div
                className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, ((data?.freeTierUsed || 0) / 1000) * 100)}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {data ? 1000 - data.freeTierUsed : 1000} conversas de serviço restantes no mês
            </p>
          </div>

          {/* 3: Economia Facebook Ads (Janela 72h Grátis) */}
          <div className="p-4 bg-white rounded-2xl border border-blue-200 bg-blue-50/20 shadow-xs">
            <div className="flex items-center justify-between text-xs text-blue-700 mb-1">
              <span className="font-bold">Economia Meta Ads (72h)</span>
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-blue-900">
                R$ {data ? data.adsFreeSavingsBrl.toFixed(2) : '0.00'}
              </span>
              <span className="text-xs text-blue-600 font-mono ml-1.5">
                (${data ? data.adsFreeSavingsUsd.toFixed(2) : '0.00'})
              </span>
            </div>
            <p className="text-[11px] text-blue-700/80 mt-2">
              {data ? data.adsFreeWindowsCount : 0} conversas vindas de anúncios isentas de cobrança
            </p>
          </div>

          {/* 4: Total de Conversas */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-semibold">Total de Conversas</span>
              <CreditCard className="w-4 h-4 text-purple-600" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-slate-900">
                {data ? data.totalConversations : 0}
              </span>
              <span className="text-xs text-slate-500 ml-1.5">janelas abertas</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Média: R${' '}
              {data && data.totalConversations > 0
                ? (data.totalSpendBrl / data.totalConversations).toFixed(2)
                : '0.00'}{' '}
              por lead
            </p>
          </div>
        </div>

        {/* Pricing Category Breakdown + Simulator */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Category Breakdown (2 columns) */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Tabela Oficial de Tarifas da Meta (Preço por Conversa)
                </h3>
                <p className="text-xs text-slate-500">
                  Tarifas para o Brasil (BRL) calculadas por sessão de 24 horas aberta
                </p>
              </div>
              <a
                href="https://developers.facebook.com/docs/whatsapp/pricing"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <span>Docs Meta</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="space-y-3">
              {/* Marketing */}
              <div className="p-3 rounded-xl border border-purple-100 bg-purple-50/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-xs">
                    M
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">Marketing (Promocional)</h4>
                    <p className="text-[11px] text-slate-500">
                      Disparos de ofertas, catálogos e cupons promocionais
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-slate-900 text-xs block">
                    $0.0625 USD
                  </span>
                  <span className="text-[11px] text-purple-700 font-semibold">
                    ~ R$ {(0.0625 * customRate).toFixed(2)} / conv.
                  </span>
                </div>
              </div>

              {/* Utility */}
              <div className="p-3 rounded-xl border border-blue-100 bg-blue-50/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                    U
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">Utilidade (Operacional)</h4>
                    <p className="text-[11px] text-slate-500">
                      Confirmações de compra, alertas de envio e boletos
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-slate-900 text-xs block">
                    $0.0350 USD
                  </span>
                  <span className="text-[11px] text-blue-700 font-semibold">
                    ~ R$ {(0.035 * customRate).toFixed(2)} / conv.
                  </span>
                </div>
              </div>

              {/* Service */}
              <div className="p-3 rounded-xl border border-teal-100 bg-teal-50/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                    S
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">Atendimento / Serviço</h4>
                    <p className="text-[11px] text-slate-500">
                      Iniciadas pelo cliente (1.000 gratuitas por mês inclusas!)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-slate-900 text-xs block">
                    $0.0300 USD
                  </span>
                  <span className="text-[11px] text-teal-700 font-semibold">
                    ~ R$ {(0.03 * customRate).toFixed(2)} / conv.
                  </span>
                </div>
              </div>

              {/* Facebook Ads Free Window */}
              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                    Ad
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-950 text-xs">
                      Anúncios Meta Ads (Click to WhatsApp)
                    </h4>
                    <p className="text-[11px] text-emerald-800">
                      Janela de 72 horas 100% GRATUITA concedida pela Meta (Free Entry Point)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-emerald-800 text-xs block">
                    $0.00 USD
                  </span>
                  <span className="text-[11px] text-emerald-600 font-bold uppercase">
                    100% Isento
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Budget Simulator Card (1 column) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Calculator className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Simulador de Orçamento</h3>
            </div>

            <p className="text-xs text-slate-500">
              Calcule quanto custará um disparo para a sua base de clientes antes de enviar:
            </p>

            <div className="space-y-3.5">
              <div>
                <label className="block font-semibold text-slate-700 text-xs mb-1">
                  Quantidade de Contatos
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="1000000"
                    step="500"
                    value={simLeads}
                    onChange={(e) => setSimLeads(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  {[500, 1000, 5000, 10000].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSimLeads(n)}
                      className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      {n.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 text-xs mb-1">
                  Categoria da Mensagem
                </label>
                <select
                  value={simCategory}
                  onChange={(e) => setSimCategory(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="marketing">Marketing (Ofertas, Black Friday) - $0.0625</option>
                  <option value="utility">Utilidade (Avisos, Notificações) - $0.0350</option>
                  <option value="service">Atendimento / Respostas - $0.0300</option>
                  <option value="authentication">Autenticação (OTP) - $0.0315</option>
                </select>
              </div>

              {/* Simulation Result Box */}
              <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Custo Estimado do Disparo
                </span>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-xl font-black text-emerald-400">
                      R$ {simCostBrl.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-300 ml-2 font-mono">
                      (${simCostUsd.toFixed(2)} USD)
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-300 border-t border-slate-800 pt-2 flex items-center justify-between">
                  <span>Preço por contato:</span>
                  <span className="font-mono text-emerald-300">
                    R$ {(PRICING[simCategory] * customRate).toFixed(3)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Breakdown by WhatsApp Account / Number */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Gastos por Linha / Número de WhatsApp Conectado
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {accounts.length} números cadastrados
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px]">
                  <th className="pb-2.5">Número / Instância</th>
                  <th className="pb-2.5">Phone Number ID</th>
                  <th className="pb-2.5 text-center">Conversas</th>
                  <th className="pb-2.5 text-center">Mensagens</th>
                  <th className="pb-2.5 text-right">Gasto (USD)</th>
                  <th className="pb-2.5 text-right">Gasto (BRL)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((acc) => {
                  const accStat = data?.byAccount?.find((b) => b.accountId === acc.id) || {
                    conversationsCount: 0,
                    messagesCount: 0,
                    estimatedCostUsd: 0,
                    estimatedCostBrl: 0,
                  };

                  return (
                    <tr key={acc.id} className="hover:bg-slate-50/70">
                      <td className="py-3 font-semibold text-slate-800 flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
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
                        <span>{acc.name}</span>
                        {acc.isDefault && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                            Padrão
                          </span>
                        )}
                      </td>
                      <td className="py-3 font-mono text-slate-500">{acc.phoneNumberId}</td>
                      <td className="py-3 text-center font-bold text-slate-800">
                        {accStat.conversationsCount}
                      </td>
                      <td className="py-3 text-center text-slate-600">
                        {accStat.messagesCount}
                      </td>
                      <td className="py-3 text-right font-mono text-slate-800 font-semibold">
                        ${accStat.estimatedCostUsd.toFixed(2)}
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-emerald-700">
                        R$ {accStat.estimatedCostBrl.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Meta Pricing FAQ / Clarification */}
        <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 text-xs text-slate-600 space-y-2">
          <p className="font-semibold text-slate-900 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-600" />
            Como funciona a cobrança oficial da Meta WhatsApp Cloud API?
          </p>
          <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed text-slate-600">
            <li>
              <strong>Janela de 24 Horas:</strong> A cobrança é feita <em>por conversa</em> de 24 horas, e não por mensagem individual. Dentro da janela de 24h, você e o cliente podem trocar mensagens ilimitadas sem custos adicionais.
            </li>
            <li>
              <strong>Janela de 72 Horas Grátis dos Anúncios:</strong> Quando um cliente clica em um anúncio do Facebook ou Instagram que direciona para o WhatsApp (Click-to-WhatsApp), a Meta concede uma janela de <strong>72 horas 100% gratuita</strong>, sem cobrar nenhuma taxa de conversa!
            </li>
            <li>
              <strong>1.000 Conversas Gratuitas Mensais:</strong> Todo mês a Meta oferece gratuitamente 1.000 conversas iniciadas por usuários (atendimento) para cada conta de WhatsApp Business (WABA).
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
