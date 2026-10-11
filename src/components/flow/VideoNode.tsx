import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Video, Play } from 'lucide-react';

export const VideoNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  return (
    <div
      className={`min-w-[260px] max-w-[320px] bg-white rounded-xl shadow-sm border transition-all ${
        selected ? 'border-rose-600 ring-2 ring-rose-500/20 shadow-md' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-rose-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="bg-rose-50 px-3.5 py-2.5 rounded-t-xl border-b border-rose-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-xs">
            <Video className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-rose-950">Enviar Vídeo</span>
        </div>
        <span className="text-[10px] font-medium text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-md">
          Vídeo MP4
        </span>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-[11px] font-medium text-slate-500">{data.label || 'Vídeo Apresentação'}</p>

        {data.mediaUrl ? (
          <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-900 h-28 flex items-center justify-center group">
            <video
              src={data.mediaUrl}
              className="w-full h-full object-cover opacity-80"
              preload="metadata"
            />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <div className="w-9 h-9 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-md">
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </div>
            </div>
            <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
              MP4
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-rose-200 bg-rose-50/50 p-4 text-center">
            <Video className="w-5 h-5 text-rose-400 mx-auto mb-1" />
            <p className="text-[11px] text-rose-600">Sem vídeo configurado</p>
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
        className="!bg-rose-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
};
