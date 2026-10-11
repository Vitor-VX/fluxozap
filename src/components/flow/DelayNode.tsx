import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Clock } from 'lucide-react';

export const DelayNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  const unitLabels: Record<string, string> = {
    seconds: 'segundos', minutes: 'minutos', hours: 'horas', days: 'dias', months: 'meses',
  };
  const duration = `${data.delayValue ?? data.delaySeconds ?? 2} ${unitLabels[data.delayUnit || 'seconds']}`;
  const summary = data.delayMode === 'until' && data.delayUntil
    ? new Date(data.delayUntil).toLocaleString('pt-BR')
    : duration;
  return (
    <div
      className={`relative min-w-[250px] bg-white rounded-2xl shadow-sm border transition-all ${
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
          Persistente
        </span>
      </div>

      <div className="p-3 text-xs text-slate-600 space-y-2.5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
            {data.delayMode === 'until' ? 'Retomar em' : 'Esperar por'}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{summary}</p>
        </div>
        <div className="relative h-7 flex items-center justify-end rounded-lg bg-slate-100 px-2.5 pr-4 text-[10px] font-semibold text-slate-700">
          Prazo concluído
          <Handle
            type="source"
            position={Position.Right}
            id="completed"
            className="flow-handle flow-handle--neutral !top-1/2 !-right-[19px]"
          />
        </div>
      </div>
    </div>
  );
};
