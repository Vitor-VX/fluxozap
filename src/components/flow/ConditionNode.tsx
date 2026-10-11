import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

export const ConditionNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  return (
    <div
      className={`min-w-[240px] bg-white rounded-xl shadow-sm border transition-all ${
        selected ? 'border-amber-600 ring-2 ring-amber-500/20 shadow-md' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-amber-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="bg-amber-50 px-3.5 py-2.5 rounded-t-xl border-b border-amber-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-600 text-white flex items-center justify-center shadow-xs">
            <GitBranch className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-amber-950">Condição / Se</span>
        </div>
        <span className="text-[10px] font-medium text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md">
          Regra
        </span>
      </div>

      <div className="p-3 text-xs space-y-1.5">
        <div className="bg-slate-50 border border-slate-200 rounded p-2 text-[11px] text-slate-700 font-mono">
          Se <span className="text-amber-700 font-semibold">{data.conditionVariable || '{{resposta}}'}</span>{' '}
          {data.conditionOperator || 'contém'}{' '}
          <span className="text-emerald-700 font-semibold">"{data.conditionValue || 'sim'}"</span>
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 px-1 pt-1">
          <span>Saída Superior: Sim</span>
          <span>Saída Inferior: Não</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: '35%' }}
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: '65%' }}
        className="!bg-rose-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
};
