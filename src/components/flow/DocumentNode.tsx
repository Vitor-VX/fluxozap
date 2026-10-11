import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText, Download } from 'lucide-react';

export const DocumentNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  return (
    <div
      className={`min-w-[260px] max-w-[320px] bg-white rounded-xl shadow-sm border transition-all ${
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
            <FileText className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-amber-950">Enviar Documento</span>
        </div>
        <span className="text-[10px] font-medium text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md">
          PDF / Doc
        </span>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-[11px] font-medium text-slate-500">{data.label || 'Documento Anexo'}</p>

        <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
          <div className="w-8 h-8 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="overflow-hidden flex-1">
            <p className="text-xs font-medium text-slate-800 truncate">
              {data.filename || 'documento.pdf'}
            </p>
            <p className="text-[10px] text-slate-400 truncate">
              {data.mediaUrl ? 'Arquivo vinculado' : 'URL não configurada'}
            </p>
          </div>
          <Download className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </div>

        {data.caption && (
          <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-md border border-slate-200/60 leading-relaxed">
            <span className="text-[10px] font-semibold text-slate-400 block mb-0.5">Legenda:</span>
            {data.caption}
          </p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-amber-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
};
