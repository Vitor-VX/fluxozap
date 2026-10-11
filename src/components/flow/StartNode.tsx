import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Play, Sparkles, Filter } from 'lucide-react';

export const StartNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  const triggerType = data.triggerType || 'all';
  const keywords: string[] = data.triggerKeywords || [];

  return (
    <div
      className={`min-w-[240px] max-w-[300px] bg-white rounded-xl shadow-sm border transition-all ${
        selected ? 'border-emerald-600 ring-2 ring-emerald-500/20 shadow-md' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="bg-emerald-50 px-3.5 py-2.5 rounded-t-xl border-b border-emerald-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <Play className="w-3.5 h-3.5 fill-current" />
          </div>
          <span className="text-xs font-semibold text-emerald-950">Gatilho de Início</span>
        </div>
        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
          {triggerType === 'all' ? 'Qualquer msg' : triggerType === 'exact' ? 'Texto exato' : 'Contém palavra'}
        </span>
      </div>

      <div className="p-3 text-xs text-slate-600 space-y-1.5">
        <p className="font-semibold text-slate-800">{data.label || 'Início da Conversa'}</p>

        {triggerType === 'all' ? (
          <p className="text-[11px] text-slate-500 leading-snug">
            Disparado automaticamente ao receber qualquer mensagem do cliente.
          </p>
        ) : (
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-emerald-700 block">
              {triggerType === 'exact' ? 'Dispara somente com mensagem exata:' : 'Dispara se a mensagem contiver:'}
            </span>
            <div className="flex flex-wrap gap-1">
              {keywords.length > 0 ? (
                keywords.map((k, idx) => (
                  <span
                    key={idx}
                    className="font-mono text-[10px] bg-emerald-50 text-emerald-900 border border-emerald-200/80 px-1.5 py-0.5 rounded truncate max-w-[200px]"
                  >
                    "{k}"
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-rose-500 italic">Nenhuma palavra-chave configurada</span>
              )}
            </div>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
};
