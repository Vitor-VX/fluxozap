import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { BadgeDollarSign } from 'lucide-react';

export const XPagPaymentNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  const method = ['PIX', 'SPEI', 'OXXO'].includes(data.xpagMethod) ? data.xpagMethod : 'PIX';
  const currency = method === 'PIX' ? 'BRL' : 'MXN';
  return (
    <div className={`relative min-w-[310px] max-w-[350px] bg-white rounded-2xl shadow-sm border transition-all ${
      selected ? 'border-violet-600 ring-2 ring-violet-500/20 shadow-md' : 'border-slate-200 hover:border-slate-300'
    }`}>
      <Handle type="target" position={Position.Left} className="!bg-violet-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="bg-violet-50 px-3.5 py-2.5 rounded-t-xl border-b border-violet-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-violet-600 text-white flex items-center justify-center shadow-xs">
            <BadgeDollarSign className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-violet-950">Cobrança XPag</span>
        </div>
        <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-md">{method}</span>
      </div>
      <div className="p-3 space-y-2">
        <p className="text-[11px] font-medium text-slate-500">{data.label || 'Gerar Pagamento'}</p>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-sm font-bold text-slate-900">{data.xpagAmount || '0.00'} {currency}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            Salva em <span className="font-mono">{`{{${data.xpagVariablePrefix || 'xpag'}_*}}`}</span>
          </p>
        </div>
        <div className="border-t border-slate-100 pt-2 space-y-1.5 text-[10px] font-semibold">
          <div className="relative h-8 flex items-center justify-end rounded-lg bg-emerald-50 px-2.5 pr-4 text-emerald-700">
            Gerada
            <Handle type="source" position={Position.Right} id="generated" className="flow-handle flow-handle--success !top-1/2 !-right-[19px]" />
          </div>
          <div className="relative h-8 flex items-center justify-end rounded-lg bg-blue-50 px-2.5 pr-4 text-blue-700">
            Paga
            <Handle type="source" position={Position.Right} id="paid" className="flow-handle flow-handle--paid !top-1/2 !-right-[19px]" />
          </div>
          <div className="relative h-8 flex items-center justify-end rounded-lg bg-rose-50 px-2.5 pr-4 text-rose-700">
            Erro
            <Handle type="source" position={Position.Right} id="error" className="flow-handle flow-handle--error !top-1/2 !-right-[19px]" />
          </div>
          <div className="relative h-8 flex items-center justify-end rounded-lg bg-amber-50 px-2.5 pr-4 text-amber-700">
            Expirada
            <Handle type="source" position={Position.Right} id="expired" className="flow-handle flow-handle--warning !top-1/2 !-right-[19px]" />
          </div>
        </div>
      </div>
    </div>
  );
};
