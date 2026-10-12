import {
  MessageSquare,
  Image as ImageIcon,
  FileText,
  MessageCircleQuestion,
  Clock,
  GitBranch,
  Plus,
  Mic,
  Video,
  BadgeDollarSign,
  CircleStop,
} from 'lucide-react';
import { NodeType } from '../../types/flow';

interface NodeSidebarProps {
  onAddNode: (type: NodeType) => void;
}

export const NodeSidebar: React.FC<NodeSidebarProps> = ({ onAddNode }) => {
  const nodeTypes = [
    {
      type: 'send_text' as NodeType,
      title: 'Mensagem de Texto',
      desc: 'Enviar texto com suporte a {{variáveis}} e emojis',
      icon: MessageSquare,
      color: 'bg-blue-600',
      lightColor: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      type: 'send_image' as NodeType,
      title: 'Enviar Imagem',
      desc: 'Foto ou banner com upload direto para a Meta',
      icon: ImageIcon,
      color: 'bg-purple-600',
      lightColor: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    {
      type: 'send_audio' as NodeType,
      title: 'Enviar Áudio / Voz',
      desc: 'Mensagem de voz em áudio (.mp3/ogg) gravada ou upload',
      icon: Mic,
      color: 'bg-teal-600',
      lightColor: 'bg-teal-50 text-teal-700 border-teal-200',
    },
    {
      type: 'send_video' as NodeType,
      title: 'Enviar Vídeo',
      desc: 'Vídeo institucional ou explicativo (.mp4)',
      icon: Video,
      color: 'bg-rose-600',
      lightColor: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    {
      type: 'send_document' as NodeType,
      title: 'Enviar Documento',
      desc: 'Arquivo PDF, catálogo ou planilha comercial',
      icon: FileText,
      color: 'bg-amber-600',
      lightColor: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      type: 'xpag_payment' as NodeType,
      title: 'Gerar Pagamento',
      desc: 'Gera PIX, SPEI ou voucher OXXO pela XPag',
      icon: BadgeDollarSign,
      color: 'bg-violet-600',
      lightColor: 'bg-violet-50 text-violet-700 border-violet-200',
    },
    {
      type: 'wait_reply' as NodeType,
      title: 'Aguardar Resposta',
      desc: 'Espera uma resposta e pode seguir por timeout',
      icon: MessageCircleQuestion,
      color: 'bg-emerald-600',
      lightColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      type: 'delay' as NodeType,
      title: 'Tempo de Espera',
      desc: 'Agenda a retomada mesmo após reiniciar o servidor',
      icon: Clock,
      color: 'bg-slate-700',
      lightColor: 'bg-slate-100 text-slate-700 border-slate-200',
    },
    {
      type: 'condition' as NodeType,
      title: 'Condição / Ramificação',
      desc: 'Direciona por resposta (ex: Se disse "sim")',
      icon: GitBranch,
      color: 'bg-orange-600',
      lightColor: 'bg-orange-50 text-orange-700 border-orange-200',
    },
    {
      type: 'end' as NodeType,
      title: 'Finalizar Funil',
      desc: 'Encerra a execução e impede reinício automático',
      icon: CircleStop,
      color: 'bg-rose-600',
      lightColor: 'bg-rose-50 text-rose-700 border-rose-200',
    },
  ];

  return (
    <div className="w-72 bg-white border-r border-slate-200 flex flex-col h-full shrink-0 select-none">
      <div className="p-4 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Blocos de Construção</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Clique em um bloco para adicionar ao fluxo do WhatsApp
        </p>
      </div>

      <div className="p-3 space-y-2 overflow-y-auto flex-1">
        {nodeTypes.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.type}
              type="button"
              onClick={() => onAddNode(item.type)}
              className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-xs transition-all bg-white group flex items-start gap-3 cursor-pointer"
            >
              <div
                className={`w-8 h-8 rounded-lg text-white flex items-center justify-center shrink-0 ${item.color} shadow-xs group-hover:scale-105 transition-transform`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-950">
                    {item.title}
                  </span>
                  <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-2">
                  {item.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

    </div>
  );
};
