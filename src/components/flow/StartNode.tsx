import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Play } from 'lucide-react';

export const StartNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  return (
    <div
      className={`min-w-[220px] bg-white rounded-xl shadow-sm border transition-all ${
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
          WhatsApp
        </span>
      </div>

      <div className="p-3 text-xs text-slate-600">
        <p className="font-medium text-slate-800">{data.label || 'Início da Conversa'}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{data.text || 'Disparado ao receber qualquer mensagem'}</p>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
};
