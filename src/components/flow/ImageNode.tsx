import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Image as ImageIcon } from 'lucide-react';

export const ImageNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  return (
    <div
      className={`min-w-[260px] max-w-[320px] bg-white rounded-xl shadow-sm border transition-all ${
        selected ? 'border-purple-600 ring-2 ring-purple-500/20 shadow-md' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-purple-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="bg-purple-50 px-3.5 py-2.5 rounded-t-xl border-b border-purple-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-xs">
            <ImageIcon className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-purple-950">Enviar Imagem</span>
        </div>
        <span className="text-[10px] font-medium text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-md">
          Mídia
        </span>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-[11px] font-medium text-slate-500">{data.label || 'Imagem WhatsApp'}</p>
        
        {data.mediaUrl ? (
          <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100 h-28 flex items-center justify-center">
            <img
              src={data.mediaUrl}
              alt="Mídia"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Graceful fallback
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-purple-200 bg-purple-50/50 p-4 text-center">
            <ImageIcon className="w-5 h-5 text-purple-400 mx-auto mb-1" />
            <p className="text-[11px] text-purple-600">Sem URL de imagem informada</p>
          </div>
        )}

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
        className="!bg-purple-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
};
