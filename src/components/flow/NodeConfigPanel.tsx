import React, { useState } from 'react';
import {
  Trash2,
  X,
  Info,
  Variable,
  Link,
  Play,
  Plus,
  Check,
  UploadCloud,
  Loader2,
  Mic,
  Video,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import { FlowNodeData } from '../../types/flow';

interface NodeConfigPanelProps {
  accountId?: string;
  selectedNode: { id: string; type: string; data: FlowNodeData } | null;
  onUpdateData: (nodeId: string, newData: Partial<FlowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  accountId,
  selectedNode,
  onUpdateData,
  onDeleteNode,
  onClose,
}) => {
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);

  if (!selectedNode) return null;

  const data = selectedNode.data;
  const isStart = selectedNode.type === 'start';
  const isMediaNode = ['send_image', 'send_audio', 'send_video', 'send_document'].includes(selectedNode.type);
  const mediaStorage = data.mediaStorage || 'meta';

  const copyVariable = async (variableName: string) => {
    const token = `{{${variableName}}}`;
    await navigator.clipboard.writeText(token);
    setCopiedVariable(variableName);
    window.setTimeout(() => setCopiedVariable(null), 1400);
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (mediaStorage === 'meta' && !accountId) {
      alert('Selecione uma linha do WhatsApp antes de enviar a mídia.');
      e.target.value = '';
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      alert('O arquivo excede o limite máximo de 100 MB.');
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    setUploadSuccess(null);

    try {
      const uploadUrl = mediaStorage === 'r2'
        ? '/api/r2/media'
        : `/api/meta/media?accountId=${encodeURIComponent(accountId || '')}`;
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
          'X-File-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      const raw = await res.text();
      let resData: any = {};
      try { resData = JSON.parse(raw); } catch { resData = { error: raw }; }
      const uploadedReference = mediaStorage === 'r2' ? resData.mediaUrl : resData.mediaId;
      if (!res.ok || !uploadedReference) {
        alert(resData.error || `Não foi possível enviar o arquivo para ${mediaStorage === 'r2' ? 'o Cloudflare R2' : 'a Meta'}.`);
        return;
      }
      onUpdateData(selectedNode.id, {
        mediaStorage,
        mediaId: mediaStorage === 'meta' ? resData.mediaId : '',
        mediaUrl: mediaStorage === 'r2' ? resData.mediaUrl : '',
        mediaMimeType: resData.mimeType || file.type,
        mediaSize: resData.size || file.size,
        filename: resData.filename || file.name,
      });
      setUploadSuccess(mediaStorage === 'r2'
        ? 'Arquivo salvo no Cloudflare R2. No envio, ele será associado à Meta da linha que executar o fluxo.'
        : 'Arquivo preparado diretamente na Meta. Nenhuma cópia foi salva no R2.');
      setTimeout(() => setUploadSuccess(null), 5000);
    } catch (err: any) {
      alert(err.message || `Erro ao enviar arquivo para ${mediaStorage === 'r2' ? 'o Cloudflare R2' : 'a Meta'}.`);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const addVariableToText = (varName: string) => {
    const current = data.text || '';
    onUpdateData(selectedNode.id, { text: current + ` {{${varName}}}` });
  };

  const handleAddKeyword = (kw?: string) => {
    const val = kw || newKeywordInput.trim();
    if (!val) return;
    const currentKeywords = data.triggerKeywords || [];
    if (!currentKeywords.includes(val)) {
      onUpdateData(selectedNode.id, {
        triggerKeywords: [...currentKeywords, val],
      });
    }
    setNewKeywordInput('');
  };

  const handleRemoveKeyword = (kwToRemove: string) => {
    const currentKeywords = data.triggerKeywords || [];
    onUpdateData(selectedNode.id, {
      triggerKeywords: currentKeywords.filter((k) => k !== kwToRemove),
    });
  };

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col h-full shrink-0 shadow-lg z-10">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Propriedades do Bloco
          </span>
          <h3 className="text-sm font-bold text-slate-900 truncate">
            {data.label || 'Configurar Bloco'}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form Content */}
      <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
        {/* Label */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Título do Bloco</label>
          <input
            type="text"
            value={data.label || ''}
            onChange={(e) => onUpdateData(selectedNode.id, { label: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            placeholder="Ex: Mensagem de Boas-Vindas"
          />
        </div>

        {/* Start Trigger Node Fields */}
        {selectedNode.type === 'start' && (
          <div className="space-y-3.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Condição para Disparar o Funil
              </label>
              <select
                value={data.triggerType || 'all'}
                onChange={(e) =>
                  onUpdateData(selectedNode.id, {
                    triggerType: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
              >
                <option value="all">Qualquer mensagem que a pessoa enviar</option>
                <option value="exact">Mensagem exata (ex: "Olá, quero saber mais informações")</option>
                <option value="contains">Contém palavras-chave (ex: "comprar", "preço")</option>
              </select>
            </div>

            {data.triggerType !== 'all' && (
              <div className="space-y-2.5 p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
                <span className="font-semibold text-emerald-900 block text-[11px]">
                  {data.triggerType === 'exact'
                    ? 'Mensagens Exatas que Ativam o Funil:'
                    : 'Palavras-chave que Ativam o Funil:'}
                </span>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newKeywordInput}
                    onChange={(e) => setNewKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                    placeholder={
                      data.triggerType === 'exact'
                        ? 'Ex: Olá, quero saber mais informações'
                        : 'Ex: comprar, suporte'
                    }
                    className="flex-1 px-2.5 py-1.5 border border-emerald-300 rounded-lg bg-white text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddKeyword()}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shrink-0"
                  >
                    Adicionar
                  </button>
                </div>

                {/* Keywords list */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(data.triggerKeywords || []).map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-emerald-300 text-emerald-950 font-mono text-[11px] shadow-2xs"
                    >
                      <span>"{kw}"</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyword(kw)}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {(!data.triggerKeywords || data.triggerKeywords.length === 0) && (
                    <p className="text-[10px] text-rose-600 italic">
                      Adicione ao menos uma frase ou palavra-chave para ativar.
                    </p>
                  )}
                </div>

                {/* Quick suggestions */}
                <div className="pt-2 border-t border-emerald-200/60">
                  <span className="text-[10px] text-emerald-800 font-semibold block mb-1">
                    Sugestões rápidas:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      'Olá, quero saber mais informações',
                      'Quero falar com um atendente',
                      'Menu',
                      'Comprar',
                    ].map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => handleAddKeyword(sug)}
                        className="text-[10px] bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded px-1.5 py-0.5 cursor-pointer transition-colors"
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-emerald-800 leading-relaxed pt-1">
                  ⚠️ Se o cliente enviar uma mensagem que não corresponder a estas palavras, a conversa será registrada para atendimento humano, mas o robô não responderá.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Text Node Fields */}
        {selectedNode.type === 'send_text' && (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700">Mensagem no WhatsApp</label>
                <span className="text-[10px] text-slate-400">Suporta *negrito* e _itálico_</span>
              </div>
              <textarea
                rows={5}
                value={data.text || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { text: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-sans"
                placeholder="Digite a mensagem que o WhatsApp enviará..."
              />
            </div>

            <div>
              <span className="block text-[11px] font-medium text-slate-500 mb-1.5">
                Inserir variável padrão ou coletada:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {['nome', 'telefone', 'data', 'hora', 'dia_semana', 'interesse', 'email'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => addVariableToText(v)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-[11px] border border-slate-200 cursor-pointer font-mono transition-colors"
                  >
                    <Variable className="w-3 h-3 text-slate-500" />
                    <span>{`{{${v}}}`}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Upload Success Banner */}
        {uploadSuccess && (
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{uploadSuccess}</span>
          </div>
        )}

        {isMediaNode && (
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
            <label className="block font-semibold text-slate-700 mb-2">Destino do arquivo do computador</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateData(selectedNode.id, { mediaStorage: 'meta' })}
                className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${mediaStorage === 'meta'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
              >
                Direto para Meta
              </button>
              <button
                type="button"
                onClick={() => onUpdateData(selectedNode.id, { mediaStorage: 'r2' })}
                className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${mediaStorage === 'r2'
                  ? 'border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-200'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
              >
                Cloudflare R2
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              {mediaStorage === 'r2'
                ? 'O arquivo ficará persistido no R2. Ao executar o bloco, o FluxoZap o envia usando as credenciais Meta da linha ativa.'
                : 'O arquivo é enviado agora para a biblioteca de mídia da Meta da linha selecionada e não é salvo no R2.'}
            </p>
          </div>
        )}

        {data.mediaId && isMediaNode && (
          <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-[11px]">
            <p className="font-semibold">Mídia pronta na Meta</p>
            <p className="mt-0.5 truncate">{data.filename || data.mediaId} · não armazenada no R2</p>
          </div>
        )}

        {data.mediaUrl && mediaStorage === 'r2' && isMediaNode && (
          <div className="p-2.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-[11px]">
            <p className="font-semibold">Mídia salva no Cloudflare R2</p>
            <p className="mt-0.5 truncate">{data.filename || data.mediaUrl}</p>
          </div>
        )}

        {/* Image Node Fields */}
        {selectedNode.type === 'send_image' && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Enviar imagem para {mediaStorage === 'r2' ? 'o Cloudflare R2' : 'a Meta'}</label>
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-purple-300 hover:border-purple-500 rounded-xl bg-purple-50/50 hover:bg-purple-50 cursor-pointer transition-all">
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                    <span className="text-xs font-semibold text-purple-700">Enviando para {mediaStorage === 'r2' ? 'o R2' : 'a Meta'}...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-semibold text-purple-700">
                      Selecionar Imagem do PC (.jpg, .png)
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleMediaUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">URL externa da imagem (opcional)</label>
              <div className="relative">
                <input
                  type="text"
                  value={data.mediaUrl || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { mediaUrl: e.target.value, mediaId: '', mediaMimeType: '' })}
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs"
                  placeholder="https://pub-xxx.r2.dev/foto.jpg"
                />
                <Link className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                O destino escolhido acima vale para arquivos do computador. Uma URL externa será baixada pelo servidor e convertida em media_id no envio.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Legenda da Foto (Opcional)</label>
              <textarea
                rows={3}
                value={data.caption || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { caption: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs"
                placeholder="Texto que acompanha a foto no WhatsApp..."
              />
            </div>
          </div>
        )}

        {/* Audio Node Fields (Voz/Áudio) */}
        {selectedNode.type === 'send_audio' && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Enviar áudio para {mediaStorage === 'r2' ? 'o Cloudflare R2' : 'a Meta'}</label>
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-teal-300 hover:border-teal-500 rounded-xl bg-teal-50/50 hover:bg-teal-50 cursor-pointer transition-all">
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />
                    <span className="text-xs font-semibold text-teal-700">Enviando áudio para {mediaStorage === 'r2' ? 'o R2' : 'a Meta'}...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 text-teal-600" />
                    <span className="text-xs font-semibold text-teal-700">
                      Selecionar Áudio do PC (.mp3, .ogg, .wav, .m4a)
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleMediaUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">URL externa do áudio (opcional)</label>
              <div className="relative">
                <input
                  type="text"
                  value={data.mediaUrl || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { mediaUrl: e.target.value, mediaId: '', mediaMimeType: '' })}
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-xs"
                  placeholder="https://pub-xxx.r2.dev/audio.mp3"
                />
                <Link className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                O destino escolhido acima vale para arquivos do computador; URLs externas continuam disponíveis como alternativa.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome de Referência do Áudio</label>
              <input
                type="text"
                value={data.filename || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { filename: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-xs"
                placeholder="ex: audio_apresentacao.mp3"
              />
            </div>
          </div>
        )}

        {/* Video Node Fields */}
        {selectedNode.type === 'send_video' && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Enviar vídeo para {mediaStorage === 'r2' ? 'o Cloudflare R2' : 'a Meta'}</label>
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-rose-300 hover:border-rose-500 rounded-xl bg-rose-50/50 hover:bg-rose-50 cursor-pointer transition-all">
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-rose-600 animate-spin" />
                    <span className="text-xs font-semibold text-rose-700">Enviando vídeo para {mediaStorage === 'r2' ? 'o R2' : 'a Meta'}...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 text-rose-600" />
                    <span className="text-xs font-semibold text-rose-700">
                      Selecionar Vídeo do PC (.mp4, .mov)
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleMediaUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">URL externa do vídeo (opcional)</label>
              <div className="relative">
                <input
                  type="text"
                  value={data.mediaUrl || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { mediaUrl: e.target.value, mediaId: '', mediaMimeType: '' })}
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-xs"
                  placeholder="https://pub-xxx.r2.dev/video.mp4"
                />
                <Link className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Legenda do Vídeo (Opcional)</label>
              <textarea
                rows={3}
                value={data.caption || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { caption: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-xs"
                placeholder="Legenda descritiva do vídeo..."
              />
            </div>
          </div>
        )}

        {/* Document Node Fields */}
        {selectedNode.type === 'send_document' && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Enviar documento para {mediaStorage === 'r2' ? 'o Cloudflare R2' : 'a Meta'}</label>
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-amber-300 hover:border-amber-500 rounded-xl bg-amber-50/50 hover:bg-amber-50 cursor-pointer transition-all">
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                    <span className="text-xs font-semibold text-amber-700">Enviando arquivo para {mediaStorage === 'r2' ? 'o R2' : 'a Meta'}...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-semibold text-amber-700">
                      Selecionar Arquivo PDF / Doc do PC
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  onChange={handleMediaUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">URL externa do documento (opcional)</label>
              <div className="relative">
                <input
                  type="text"
                  value={data.mediaUrl || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { mediaUrl: e.target.value, mediaId: '', mediaMimeType: '' })}
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs"
                  placeholder="https://pub-xxx.r2.dev/catalogo.pdf"
                />
                <Link className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome do Arquivo Apresentado</label>
              <input
                type="text"
                value={data.filename || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { filename: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs"
                placeholder="proposta_comercial.pdf"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Legenda do Documento</label>
              <input
                type="text"
                value={data.caption || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { caption: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs"
                placeholder="Baixe a apresentação completa no anexo"
              />
            </div>
          </div>
        )}

        {/* Wait Reply Node Fields */}
        {selectedNode.type === 'xpag_payment' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-violet-50 border border-violet-200 text-[10px] leading-relaxed text-violet-900">
              Este bloco somente gera e acompanha a cobrança. Ele não envia um texto pronto: conecte a saída <strong>Gerada</strong> aos blocos de texto ou imagem e monte a mensagem com as variáveis abaixo.
            </div>
            <div className="p-2.5 bg-violet-50 rounded-lg border border-violet-100 flex gap-2">
              <Info className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-violet-900 leading-relaxed">
                Gera uma cobrança real pela XPag: PIX em BRL ou SPEI/OXXO em MXN. No simulador nenhuma transação financeira é criada.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">País e método de pagamento</label>
              <select
                value={data.xpagMethod || 'PIX'}
                onChange={(e) => onUpdateData(selectedNode.id, { xpagMethod: e.target.value as 'PIX' | 'SPEI' | 'OXXO' })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              >
                <option value="PIX">Brasil — PIX (QR Code e Copia e Cola)</option>
                <option value="SPEI">SPEI — transferência por CLABE</option>
                <option value="OXXO">OXXO — voucher pago em dinheiro</option>
              </select>
            </div>

            {data.xpagMethod === 'SPEI' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Modalidade da CLABE</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateData(selectedNode.id, { xpagSpeiMode: 'dynamic' })}
                    className={`rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                      (data.xpagSpeiMode || 'dynamic') === 'dynamic'
                        ? 'border-violet-400 bg-violet-50 text-violet-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <strong className="block text-[11px]">Dinâmica</strong>
                    <span className="mt-0.5 block text-[9px] leading-snug">Você define o valor · 24 horas · um pagamento</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateData(selectedNode.id, { xpagSpeiMode: 'open', xpagAmount: '' })}
                    className={`rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                      data.xpagSpeiMode === 'open'
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <strong className="block text-[11px]">Valor aberto</strong>
                    <span className="mt-0.5 block text-[9px] leading-snug">Pagador define o valor · sem validade · reutilizável</span>
                  </button>
                </div>
              </div>
            )}

            {data.xpagMethod === 'SPEI' && data.xpagSpeiMode === 'open' ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] leading-relaxed text-emerald-900">
                Nenhum valor será enviado à XPag. Será criada uma CLABE exclusiva para esta venda, vinculada ao ID e webhook do contato. O pagador escolhe quanto transferir.
              </div>
            ) : (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Valor em {data.xpagMethod === 'PIX' || !data.xpagMethod ? 'BRL' : 'MXN'}
                </label>
                <input
                  type="text"
                  value={data.xpagAmount || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { xpagAmount: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  placeholder={data.xpagMethod === 'PIX' || !data.xpagMethod ? '50.00 ou {{valor_brl}}' : '500.00 ou {{valor_mxn}}'}
                />
                {data.xpagMethod === 'SPEI' && (
                  <p className="text-[10px] text-violet-700 mt-1">A CLABE dinâmica aceita o valor exato e expira em 24 horas.</p>
                )}
                {data.xpagMethod === 'OXXO' && (
                  <p className="text-[10px] text-amber-700 mt-1">OXXO aceita de 10 a 10.000 MXN e exige o valor exato.</p>
                )}
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome do pagador (opcional)</label>
              <input
                value={data.xpagPayerName || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { xpagPayerName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                placeholder="Ex.: {{nome}} ou {{telefone}}"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <button type="button" onClick={() => onUpdateData(selectedNode.id, { xpagPayerName: '{{nome}}' })} className="px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-mono cursor-pointer">
                  Usar {'{{nome}}'}
                </button>
                <button type="button" onClick={() => onUpdateData(selectedNode.id, { xpagPayerName: '{{telefone}}' })} className="px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-mono cursor-pointer">
                  Usar {'{{telefone}}'}
                </button>
                {data.xpagPayerName && (
                  <button type="button" onClick={() => onUpdateData(selectedNode.id, { xpagPayerName: '' })} className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[10px] text-slate-500 cursor-pointer">
                    Não enviar nome
                  </button>
                )}
              </div>
            </div>

            {data.xpagMethod === 'OXXO' ? (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">E-mail do pagador (opcional)</label>
                <input
                  value={data.xpagPayerEmail || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { xpagPayerEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  placeholder="{{email}}"
                />
              </div>
            ) : (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {data.xpagMethod === 'PIX' || !data.xpagMethod ? 'CPF / CNPJ (opcional)' : 'CURP / documento (opcional)'}
                </label>
                <input
                  value={data.xpagPayerDocument || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { xpagPayerDocument: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  placeholder="{{documento}}"
                />
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Se ficar vazio, nenhum documento é inventado ou enviado. O pedido continua identificado pelo ID e pelo webhook exclusivos.
                </p>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Descrição do pedido (opcional)</label>
              <input
                value={data.xpagDescription || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { xpagDescription: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                placeholder="Ex.: Pedido de {{nome}}"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Prefixo das variáveis</label>
              <input
                value={data.xpagVariablePrefix || 'xpag'}
                onChange={(e) => onUpdateData(selectedNode.id, {
                  xpagVariablePrefix: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/^\d+/, '') || 'xpag',
                })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                placeholder="xpag"
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                Use outro prefixo, como <code>pedido_1</code>, quando houver mais de uma cobrança no mesmo fluxo.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold text-slate-800 mb-2">Variáveis geradas</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'status', 'amount', 'currency', 'method', 'charge_mode', 'open_value', 'provider', 'fee', 'external_id', 'transaction_id', 'request_number',
                  ...(data.xpagMethod === 'PIX' || !data.xpagMethod ? ['pix_copy_paste', 'qr_code_url'] : []),
                  ...(data.xpagMethod === 'SPEI' ? ['clabe', 'bank', 'beneficiary', 'reference'] : []),
                  ...(data.xpagMethod === 'OXXO' ? ['oxxo_reference', 'oxxo_barcode', 'reference'] : []),
                  'checkout_url', 'expires_at', 'expire_minutes', 'paid_at', 'e2e', 'error', 'error_code',
                ].map((suffix) => {
                  const variableName = `${data.xpagVariablePrefix || 'xpag'}_${suffix}`;
                  return (
                    <button
                      key={suffix}
                      type="button"
                      onClick={() => copyVariable(variableName)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50 text-[9px] font-mono text-slate-700 cursor-pointer"
                      title="Copiar variável"
                    >
                      {copiedVariable === variableName ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      {`{{${variableName}}}`}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Para enviar o QR Code, crie um bloco <strong>Enviar Imagem</strong> e use a variável <code>{`{{${data.xpagVariablePrefix || 'xpag'}_qr_code_url}}`}</code> na URL.
              </p>
            </div>

            {!(data.xpagMethod === 'SPEI' && data.xpagSpeiMode === 'open') && <div>
              <label className="block font-semibold text-slate-700 mb-1">Expiração local de segurança (minutos, opcional)</label>
              <input
                type="number"
                min={1}
                value={data.xpagExpirationMinutes || ''}
                onChange={(e) => onUpdateData(selectedNode.id, {
                  xpagExpirationMinutes: e.target.value ? Math.max(1, Number(e.target.value)) : undefined,
                })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                placeholder="Usar o vencimento retornado pela XPag"
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                Se a API não retornar uma data de vencimento, este prazo aciona a saída <strong>Expirada</strong>.
              </p>
            </div>}

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={data.xpagWaitForPayment !== false}
                onChange={(e) => onUpdateData(selectedNode.id, { xpagWaitForPayment: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-violet-600"
              />
              <span>
                <strong className="block text-slate-800">Aguardar confirmação</strong>
                <span className="text-[10px] text-slate-500 leading-relaxed">
                  A saída Gerada roda imediatamente para você enviar as instruções. Depois, a sessão aguarda o webhook e continua pela saída Paga, Erro ou Expirada.
                </span>
              </span>
            </label>

            <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-[10px] leading-relaxed text-amber-900">
              O WhatsApp não oferece botão nativo para copiar um PIX/CLABE arbitrário em mensagens comuns. Os botões “copiar código” da Meta são restritos a templates de autenticação. Por isso, envie o código em uma mensagem separada para o cliente copiar sem misturá-lo ao restante do texto.
            </div>
          </div>
        )}

        {/* Wait Reply Node Fields */}
        {selectedNode.type === 'wait_reply' && (
          <div className="space-y-3">
            <div className="p-2.5 bg-teal-50 rounded-lg border border-teal-100 flex gap-2">
              <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-teal-800 leading-relaxed">
                Este bloco interrompe o envio e espera o usuário enviar uma mensagem no WhatsApp.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome da variável para salvar (opcional)</label>
              <div className="flex items-center">
                <span className="px-2.5 py-2 bg-slate-100 border border-r-0 border-slate-300 rounded-l-lg text-slate-500 font-mono text-xs">
                  {'{{'}
                </span>
                <input
                  type="text"
                  value={data.variableName || ''}
                  onChange={(e) =>
                    onUpdateData(selectedNode.id, {
                      variableName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                    })
                  }
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-r-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-mono"
                  placeholder="ex: nome, email, interesse"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                Deixe vazio para apenas aguardar a resposta e continuar o fluxo sem armazenar o conteúdo.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tipo de Resposta Esperado</label>
              <select
                value={data.expectedType || 'text'}
                onChange={(e) => onUpdateData(selectedNode.id, { expectedType: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
              >
                <option value="text">Texto livre (qualquer mensagem)</option>
                <option value="number">Número / Telefone</option>
                <option value="email">Endereço de E-mail</option>
              </select>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(data.waitReplyTimeoutEnabled)}
                onChange={(e) => onUpdateData(selectedNode.id, { waitReplyTimeoutEnabled: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-teal-600"
              />
              <span>
                <strong className="block text-slate-800">Definir tempo máximo para resposta</strong>
                <span className="text-[10px] text-slate-500 leading-relaxed">
                  Se o prazo terminar sem resposta, o funil continua pela saída Tempo esgotado.
                </span>
              </span>
            </label>

            {data.waitReplyTimeoutEnabled && (
              <div className="grid grid-cols-[1fr_1.35fr] gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prazo</label>
                  <input
                    type="number"
                    min={1}
                    value={data.waitReplyTimeoutValue || 15}
                    onChange={(e) => onUpdateData(selectedNode.id, { waitReplyTimeoutValue: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unidade</label>
                  <select
                    value={data.waitReplyTimeoutUnit || 'minutes'}
                    onChange={(e) => onUpdateData(selectedNode.id, { waitReplyTimeoutUnit: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="seconds">Segundos</option>
                    <option value="minutes">Minutos</option>
                    <option value="hours">Horas</option>
                    <option value="days">Dias</option>
                    <option value="months">Meses</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Delay Node Fields */}
        {selectedNode.type === 'delay' && (
          <div className="space-y-3">
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex gap-2">
              <Info className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-700 leading-relaxed">
                A espera é salva na sessão e retomada pelo agendador. Nenhuma Promise ou requisição fica aberta, mesmo durante dias ou após reiniciar o servidor.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tipo de espera</label>
              <select
                value={data.delayMode || 'duration'}
                onChange={(e) => onUpdateData(selectedNode.id, { delayMode: e.target.value as 'duration' | 'until' })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="duration">Esperar por uma duração</option>
                <option value="until">Esperar até uma data e hora</option>
              </select>
            </div>

            {(data.delayMode || 'duration') === 'duration' ? (
              <div className="grid grid-cols-[1fr_1.35fr] gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Duração</label>
                  <input
                    type="number"
                    min={1}
                    value={data.delayValue ?? data.delaySeconds ?? 2}
                    onChange={(e) => onUpdateData(selectedNode.id, { delayValue: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unidade</label>
                  <select
                    value={data.delayUnit || 'seconds'}
                    onChange={(e) => onUpdateData(selectedNode.id, { delayUnit: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="seconds">Segundos</option>
                    <option value="minutes">Minutos</option>
                    <option value="hours">Horas</option>
                    <option value="days">Dias</option>
                    <option value="months">Meses</option>
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Retomar em</label>
                <input
                  type="datetime-local"
                  value={data.delayUntil || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { delayUntil: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            )}
          </div>
        )}

        {/* Condition Node Fields */}
        {selectedNode.type === 'condition' && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Variável a Avaliar</label>
              <input
                type="text"
                value={data.conditionVariable || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { conditionVariable: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
                placeholder="ex: interesse ou nome"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Operador de Comparação</label>
              <select
                value={data.conditionOperator || 'contains'}
                onChange={(e) =>
                  onUpdateData(selectedNode.id, { conditionOperator: e.target.value as any })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              >
                <option value="contains">Contém o texto</option>
                <option value="equals">É exatamente igual a</option>
                <option value="starts_with">Começa com</option>
                <option value="not_empty">Não está vazio</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Valor Esperado</label>
              <input
                type="text"
                value={data.conditionValue || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { conditionValue: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                placeholder="ex: sim, quero, 1"
              />
            </div>
          </div>
        )}

        {selectedNode.type === 'end' && (
          <div className="flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <p className="text-[11px] leading-relaxed">
              Ao chegar aqui, a sessão fica concluída. Outras mensagens do contato são registradas,
              mas não disparam o funil novamente. O reinício continua disponível manualmente na conversa.
            </p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {!isStart && (
        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={() => onDeleteNode(selectedNode.id)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 border border-rose-200 text-xs font-semibold cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir este Bloco
          </button>
        </div>
      )}
    </div>
  );
};
