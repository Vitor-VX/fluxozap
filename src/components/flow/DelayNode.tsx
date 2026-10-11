import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Clock } from 'lucide-react';

export const DelayNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  return (
    <div
      className={`min-w-[220px] bg-white rounded-xl shadow-sm border transition-all ${
        selected ? 'border-slate-800 ring-2 ring-slate-800/20 shadow-md' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-slate-600 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="bg-slate-100 px-3.5 py-2 rounded-t-xl border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-slate-700 text-white flex items-center justify-center">
            <Clock className="w-3 h-3" />
          </div>
          <span className="text-xs font-semibold text-slate-800">Aguardar Tempo</span>
        </div>
        <span className="text-[10px] font-mono text-slate-600 bg-slate-200/80 px-1.5 py-0.5 rounded">
          {data.delaySeconds || 2}s
        </span>
      </div>

      <div className="p-2.5 text-xs text-slate-600">
        <p className="text-[11px] text-slate-500">Pausa de digitação no WhatsApp</p>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-600 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
};
