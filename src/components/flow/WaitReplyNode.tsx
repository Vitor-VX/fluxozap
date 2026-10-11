import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageCircleQuestion, Variable } from 'lucide-react';

export const WaitReplyNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  const unitLabels: Record<string, string> = {
    seconds: 'seg', minutes: 'min', hours: 'h', days: 'dias', months: 'meses',
  };
  return (
    <div
      className={`relative min-w-[290px] max-w-[340px] bg-white rounded-2xl shadow-sm border transition-all ${
        selected ? 'border-teal-600 ring-2 ring-teal-500/20 shadow-md' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-teal-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="bg-teal-50 px-3.5 py-2.5 rounded-t-xl border-b border-teal-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center shadow-xs">
            <MessageCircleQuestion className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-teal-950">Aguardar Resposta</span>
        </div>
        <span className="text-[10px] font-medium text-teal-700 bg-teal-100/80 px-2 py-0.5 rounded-md">
          Entrada
        </span>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-[11px] font-medium text-slate-500">{data.label || 'Aguardar mensagem do cliente'}</p>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[11px]">Salvar resposta:</span>
            <div className="flex items-center gap-1 font-mono text-xs bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200/60 font-semibold">
              <Variable className="w-3 h-3 text-teal-600" />
              <span>{data.variableName ? `{{${data.variableName}}}` : 'Não salvar'}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
            <span>Tipo esperado:</span>
            <span className="font-medium text-slate-700 capitalize">
              {data.expectedType || 'texto'}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-teal-100 bg-teal-50/60 px-2.5 py-2 text-[10px] text-teal-800">
          {data.waitReplyTimeoutEnabled
            ? `Espera até a resposta ou por ${data.waitReplyTimeoutValue || 15} ${unitLabels[data.waitReplyTimeoutUnit || 'minutes']}.`
            : 'Sem prazo: o contato permanece aqui até responder.'}
        </div>

        <div className="border-t border-slate-100 pt-2 space-y-1.5">
          <div className="relative h-7 flex items-center justify-end rounded-lg bg-emerald-50 px-2.5 pr-4 text-[10px] font-semibold text-emerald-700">
            Respondeu
            <Handle
              type="source"
              position={Position.Right}
              id="answered"
              className="flow-handle flow-handle--success !top-1/2 !-right-[19px]"
            />
          </div>
          <div className={`relative h-7 flex items-center justify-end rounded-lg px-2.5 pr-4 text-[10px] font-semibold ${
            data.waitReplyTimeoutEnabled ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-400'
          }`}>
            {data.waitReplyTimeoutEnabled ? 'Tempo esgotado' : 'Tempo esgotado · desativado'}
            <Handle
              type="source"
              position={Position.Right}
              id="timeout"
              className={`flow-handle !top-1/2 !-right-[19px] ${data.waitReplyTimeoutEnabled ? 'flow-handle--warning' : 'flow-handle--muted'}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
