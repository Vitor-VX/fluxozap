import React from 'react';
import { Trash2, X, Info, Variable, Link } from 'lucide-react';
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
  if (!selectedNode) return null;

  const data = selectedNode.data;
  const isStart = selectedNode.type === 'start';

  const addVariableToText = (varName: string) => {
    const current = data.text || '';
    onUpdateData(selectedNode.id, { text: current + ` {{${varName}}}` });
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

        {/* Image Node Fields */}
        {selectedNode.type === 'send_image' && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">URL Pública da Imagem</label>
              <div className="relative">
                <input
                  type="text"
                  value={data.mediaUrl || ''}
                  onChange={(e) => onUpdateData(selectedNode.id, { mediaUrl: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  placeholder="https://exemplo.com/imagem.png"
                />
                <Link className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                A Meta WhatsApp API requer uma URL HTTPS pública e acessível.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Legenda (Opcional)</label>
              <textarea
                rows={3}
                value={data.caption || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { caption: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                placeholder="Texto que acompanha a foto no WhatsApp..."
              />
            </div>
          </div>
        )}

        {/* Document Node Fields */}
        {selectedNode.type === 'send_document' && (
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">URL do Documento (PDF/Doc)</label>
              <input
                type="text"
                value={data.mediaUrl || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { mediaUrl: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                placeholder="https://exemplo.com/catalogo.pdf"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome do Arquivo Apresentado</label>
              <input
                type="text"
                value={data.filename || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { filename: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                placeholder="proposta_comercial.pdf"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Legenda do Documento</label>
              <input
                type="text"
                value={data.caption || ''}
                onChange={(e) => onUpdateData(selectedNode.id, { caption: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                placeholder="Baixe o arquivo acima"
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
                Este bloco é o coração da conversa interativa! Ele interrompe o envio e espera o usuário enviar uma mensagem no WhatsApp.
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
              <p className="text-[10px] text-slate-400 mt-1">
                Use este identificador em blocos seguintes: <code>{'{{'}{data.variableName || 'variavel'}{'}}'}</code>
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
              <p className="text-[10px] text-slate-400 mt-1">
                Simula o tempo em que o robô fica digitando antes da próxima mensagem.
              </p>
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
