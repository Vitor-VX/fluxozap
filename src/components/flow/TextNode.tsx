import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageSquare } from 'lucide-react';

export const TextNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  return (
    <div
      className={`min-w-[260px] max-w-[320px] bg-white rounded-xl shadow-sm border transition-all ${
        selected ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-md' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="bg-blue-50 px-3.5 py-2.5 rounded-t-xl border-b border-blue-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <MessageSquare className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-blue-950">Enviar Mensagem</span>
        </div>
        <span className="text-[10px] font-medium text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md">
          Texto
        </span>
      </div>

      <div className="p-3">
        <p className="text-[11px] font-medium text-slate-500 mb-1.5">{data.label || 'Mensagem de Texto'}</p>
        <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 text-xs text-slate-800 whitespace-pre-wrap break-words font-normal leading-relaxed">
          {data.text || <span className="text-slate-400 italic">Digite o conteúdo da mensagem...</span>}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
};
