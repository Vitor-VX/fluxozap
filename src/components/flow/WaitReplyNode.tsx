import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageCircleQuestion, Variable } from 'lucide-react';

export const WaitReplyNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  return (
    <div
      className={`min-w-[260px] max-w-[320px] bg-white rounded-xl shadow-sm border transition-all ${
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
            <span className="text-slate-500 text-[11px]">Salvar resposta em:</span>
            <div className="flex items-center gap-1 font-mono text-xs bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200/60 font-semibold">
              <Variable className="w-3 h-3 text-teal-600" />
              <span>{data.variableName ? `{{${data.variableName}}}` : '{{resposta}}'}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
            <span>Tipo esperado:</span>
            <span className="font-medium text-slate-700 capitalize">
              {data.expectedType || 'texto'}
            </span>
          </div>
        </div>

        <p className="text-[10px] text-teal-700 bg-teal-50/70 px-2 py-1 rounded border border-teal-100/80">
          ⏳ O fluxo pausa aqui até que o contato envie uma mensagem no WhatsApp.
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-teal-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
};
