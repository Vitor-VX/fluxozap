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
} from 'lucide-react';
import { FlowNodeData } from '../../types/flow';

interface NodeConfigPanelProps {
  selectedNode: { id: string; type: string; data: FlowNodeData } | null;
  onUpdateData: (nodeId: string, newData: Partial<FlowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  selectedNode,
  onUpdateData,
  onDeleteNode,
  onClose,
}) => {
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  if (!selectedNode) return null;

  const data = selectedNode.data;
  const isStart = selectedNode.type === 'start';

  // Handle direct file upload to Cloudflare R2 / Server storage
  const handleUploadToR2 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadSuccess(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            fileData: base64Data,
            mimeType: file.type,
          }),
        });

        const resData = await res.json();
        if (res.ok && resData.success) {
          onUpdateData(selectedNode.id, {
            mediaUrl: resData.url,
            filename: file.name,
          });
          setUploadSuccess(
            resData.storage === 'r2'
              ? 'Arquivo enviado com sucesso para o Cloudflare R2!'
              : 'Arquivo salvo com sucesso no servidor de mídia!'
          );
          setTimeout(() => setUploadSuccess(null), 5000);
        } else {
          alert(resData.error || 'Erro ao subir arquivo.');
        }
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setIsUploading(false);
      alert(err.message || 'Erro ao ler arquivo.');
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
                Inserir Variável Coletada:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {['nome', 'telefone', 'interesse', 'email'].map((v) => (
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

        {/* Image Node Fields */}
        {selectedNode.type === 'send_image' && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Upload da Imagem para Cloudflare R2</label>
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-purple-300 hover:border-purple-500 rounded-xl bg-purple-50/50 hover:bg-purple-50 cursor-pointer transition-all">
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                    <span className="text-xs font-semibold text-purple-700">Subindo para R2...</span>
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
                  onChange={handleUploadToR2}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">URL Pública da Imagem</label>
              <div className="relative">
                <input
                  type="text"
                  value={data.mediaUrl || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { mediaUrl: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs"
                  placeholder="https://pub-xxx.r2.dev/foto.jpg"
                />
                <Link className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Ou digite uma URL pública externa compatível com a Meta API.
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
              <label className="block font-semibold text-slate-700 mb-1">Upload do Áudio para Cloudflare R2</label>
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-teal-300 hover:border-teal-500 rounded-xl bg-teal-50/50 hover:bg-teal-50 cursor-pointer transition-all">
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />
                    <span className="text-xs font-semibold text-teal-700">Subindo áudio para R2...</span>
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
                  onChange={handleUploadToR2}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">URL Pública do Áudio</label>
              <div className="relative">
                <input
                  type="text"
                  value={data.mediaUrl || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { mediaUrl: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-xs"
                  placeholder="https://pub-xxx.r2.dev/audio.mp3"
                />
                <Link className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                A Meta WhatsApp API requer áudios em formato AAC/MP3/OGG acessíveis publicamente.
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
              <label className="block font-semibold text-slate-700 mb-1">Upload do Vídeo para Cloudflare R2</label>
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-rose-300 hover:border-rose-500 rounded-xl bg-rose-50/50 hover:bg-rose-50 cursor-pointer transition-all">
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-rose-600 animate-spin" />
                    <span className="text-xs font-semibold text-rose-700">Subindo vídeo para R2...</span>
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
                  onChange={handleUploadToR2}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">URL Pública do Vídeo</label>
              <div className="relative">
                <input
                  type="text"
                  value={data.mediaUrl || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { mediaUrl: e.target.value })}
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
              <label className="block font-semibold text-slate-700 mb-1">Upload do Documento para Cloudflare R2</label>
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-amber-300 hover:border-amber-500 rounded-xl bg-amber-50/50 hover:bg-amber-50 cursor-pointer transition-all">
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                    <span className="text-xs font-semibold text-amber-700">Subindo arquivo para R2...</span>
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
                  onChange={handleUploadToR2}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">URL do Documento (PDF/Doc)</label>
              <div className="relative">
                <input
                  type="text"
                  value={data.mediaUrl || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { mediaUrl: e.target.value })}
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
        {selectedNode.type === 'wait_reply' && (
          <div className="space-y-3">
            <div className="p-2.5 bg-teal-50 rounded-lg border border-teal-100 flex gap-2">
              <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-teal-800 leading-relaxed">
                Este bloco interrompe o envio e espera o usuário enviar uma mensagem no WhatsApp.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome da Variável para Salvar</label>
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
          </div>
        )}

        {/* Delay Node Fields */}
        {selectedNode.type === 'delay' && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tempo de Espera (Segundos)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={data.delaySeconds || 2}
                onChange={(e) =>
                  onUpdateData(selectedNode.id, { delaySeconds: Number(e.target.value) || 1 })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500"
              />
            </div>
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
