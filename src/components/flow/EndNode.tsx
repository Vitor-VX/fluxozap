import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { CircleStop } from 'lucide-react';

export const EndNode = ({ data, selected }: { data: any; selected?: boolean }) => (
  <div
    className={`relative min-w-[250px] bg-white rounded-2xl shadow-sm border transition-all ${
      selected
        ? 'border-rose-600 ring-2 ring-rose-500/20 shadow-md'
        : 'border-rose-200 hover:border-rose-300'
    }`}
  >
    <Handle
      type="target"
      position={Position.Left}
      className="flow-handle !bg-rose-500 !border-white"
    />
    <div className="bg-rose-50 px-3.5 py-2.5 rounded-t-2xl border-b border-rose-100 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-xs">
          <CircleStop className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-semibold text-rose-950">Finalizar Funil</span>
      </div>
      <span className="text-[10px] font-medium text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">Fim</span>
    </div>
    <div className="p-3">
      <p className="text-xs font-semibold text-slate-800">{data.label || 'Finalizar Funil'}</p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">
        Encerra esta execução. Novas mensagens não reiniciam o funil automaticamente.
      </p>
    </div>
  </div>
);
