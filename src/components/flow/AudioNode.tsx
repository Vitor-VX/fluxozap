import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Volume2, Mic, Play } from 'lucide-react';

export const AudioNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  return (
    <div
      className={`min-w-[260px] max-w-[320px] bg-white rounded-xl shadow-sm border transition-all ${
        selected ? 'border-teal-600 ring-2 ring-teal-500/20 shadow-md' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-teal-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="bg-teal-50 px-3.5 py-2.5 rounded-t-xl border-b border-teal-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center shadow-xs">
            <Mic className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-teal-950">Enviar Áudio / Voz</span>
        </div>
        <span className="text-[10px] font-medium text-teal-700 bg-teal-100/80 px-2 py-0.5 rounded-md">
          Áudio MP3/OGG
        </span>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-[11px] font-medium text-slate-500">{data.label || 'Mensagem de Áudio'}</p>

        {/* WhatsApp Voice Note Visual simulation */}
        <div className="p-2.5 bg-emerald-50/70 rounded-lg border border-emerald-200/60 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
          </div>
          <div className="flex-1 min-w-0">
            {/* Audio Waveform visualization */}
            <div className="flex items-center gap-0.5 h-4 mb-1">
              {[40, 75, 50, 90, 60, 30, 80, 95, 45, 65, 85, 30, 70, 50, 40].map((h, i) => (
                <div
                  key={i}
                  className="w-1 bg-emerald-400 rounded-full"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span className="font-mono">{data.durationStr || '0:24'}</span>
              <span className="truncate max-w-[110px] text-[10px] text-slate-400">
                {data.filename || (data.mediaUrl ? 'audio_whatsapp.mp3' : 'Sem arquivo')}
              </span>
            </div>
          </div>
        </div>

        {data.mediaUrl ? (
          <p className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200/60 truncate">
            ✓ Áudio vinculado no R2/servidor
          </p>
        ) : (
          <p className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200/60">
            ⚠️ Nenhum arquivo de áudio carregado
          </p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-teal-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
};
