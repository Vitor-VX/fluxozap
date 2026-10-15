import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
  ReactFlowInstance,
  XYPosition,
} from '@xyflow/react';
import { StartNode } from './StartNode';
import { TextNode } from './TextNode';
import { ImageNode } from './ImageNode';
import { DocumentNode } from './DocumentNode';
import { AudioNode } from './AudioNode';
import { VideoNode } from './VideoNode';
import { WaitReplyNode } from './WaitReplyNode';
import { DelayNode } from './DelayNode';
import { ConditionNode } from './ConditionNode';
import { XPagPaymentNode } from './XPagPaymentNode';
import { EndNode } from './EndNode';
import { NodeSidebar } from './NodeSidebar';
import { NodeConfigPanel } from './NodeConfigPanel';
import { NodeType, FlowNodeData } from '../../types/flow';
import { Save, Check, Download, Upload } from 'lucide-react';

interface FlowEditorProps {
  onFlowSaved?: () => void;
  accountId?: string;
  accountName?: string;
}

export const FlowEditor: React.FC<FlowEditorProps> = ({ onFlowSaved, accountId, accountName }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    type: string;
    data: FlowNodeData;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Define custom node types
  const nodeTypes = useMemo(
    () => ({
      start: StartNode,
      send_text: TextNode,
      send_image: ImageNode,
      send_document: DocumentNode,
      send_audio: AudioNode,
      send_video: VideoNode,
      xpag_payment: XPagPaymentNode,
      wait_reply: WaitReplyNode,
      delay: DelayNode,
      condition: ConditionNode,
      end: EndNode,
    }),
    []
  );

  // Load flow from backend
  const loadFlow = async () => {
    setIsLoading(true);
    try {
      const url = accountId ? `/api/flow?accountId=${encodeURIComponent(accountId)}` : '/api/flow';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const loadedNodes = (data.nodes || []).map((node: Node) => {
          if (node.type === 'start') {
            return {
              ...node,
              data: {
                ...node.data,
                triggerType: node.data?.triggerType || data.triggerType || 'all',
                triggerKeywords: node.data?.triggerKeywords || data.triggerKeywords || [],
              },
            };
          }
          return node;
        });
        setNodes(loadedNodes);
        const nodeTypeById = new Map(loadedNodes.map((node: Node) => [node.id, node.type]));
        const loadedEdges = (data.edges || []).map((edge: Edge) => {
          // Before payment branches existed, the only edge meant “continue after payment”.
          // Preserve that behavior and anchor it visually to the new Paga handle.
          if (nodeTypeById.get(edge.source) === 'xpag_payment' && !edge.sourceHandle) {
            return { ...edge, sourceHandle: 'paid', interactionWidth: edge.interactionWidth || 32 };
          }
          if (nodeTypeById.get(edge.source) === 'wait_reply' && !edge.sourceHandle) {
            return { ...edge, sourceHandle: 'answered', interactionWidth: edge.interactionWidth || 32 };
          }
          if (nodeTypeById.get(edge.source) === 'delay' && !edge.sourceHandle) {
            return { ...edge, sourceHandle: 'completed', interactionWidth: edge.interactionWidth || 32 };
          }
          return { ...edge, interactionWidth: edge.interactionWidth || 32 };
        });
        setEdges(loadedEdges);
      } else {
        setNodes([]);
        setEdges([]);
      }
    } catch (err) {
      console.error('Error loading flow:', err);
      setNodes([]);
      setEdges([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFlow();
  }, [accountId]);

  const onNodesChange = useCallback(
    (changes: any) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            interactionWidth: 32,
            style: { stroke: '#10b981', strokeWidth: 2.5 },
          },
          eds
        )
      ),
    []
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode({
      id: node.id,
      type: node.type || 'send_text',
      data: node.data as any,
    });
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    event.stopPropagation();
    setEdges((currentEdges) => currentEdges.filter((item) => item.id !== edge.id));
  }, []);

  const onCanvasContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const edgeElement = target.closest('.react-flow__edge');
    const edgeId = edgeElement?.getAttribute('data-id');
    if (!edgeId) return;
    event.preventDefault();
    event.stopPropagation();
    setEdges((currentEdges) => currentEdges.filter((item) => item.id !== edgeId));
  }, []);

  // Add new node of specified type
  const handleAddNode = (type: NodeType, droppedPosition?: XYPosition) => {
    const id = `node_${type}_${Date.now()}`;
    // Position node around center
    const x = droppedPosition?.x ?? 350 + Math.random() * 80;
    const y = droppedPosition?.y ?? 200 + Math.random() * 80;

    let initialData: FlowNodeData = {
      label: 'Novo Bloco',
      type,
    };

    if (type === 'send_text') {
      initialData = {
        label: 'Mensagem de Texto',
        type,
        text: 'Olá! Como posso ajudar você hoje?',
      };
    } else if (type === 'send_image') {
      initialData = {
        label: 'Enviar Imagem',
        type,
        mediaStorage: 'meta',
        mediaUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&auto=format&fit=crop',
        caption: 'Confira nossos destaques!',
      };
    } else if (type === 'send_audio') {
      initialData = {
        label: 'Enviar Áudio / Voz',
        type,
        mediaStorage: 'meta',
        sendAsVoice: true,
        mediaUrl: '',
        filename: 'mensagem_voz.mp3',
        durationStr: '0:18',
      };
    } else if (type === 'send_video') {
      initialData = {
        label: 'Enviar Vídeo',
        type,
        mediaStorage: 'meta',
        mediaUrl: '',
        filename: 'apresentacao.mp4',
        caption: 'Assista ao nosso vídeo explicativo!',
      };
    } else if (type === 'send_document') {
      initialData = {
        label: 'Enviar Documento',
        type,
        mediaStorage: 'meta',
        mediaUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        filename: 'apresentacao.pdf',
        caption: 'Documento informativo em PDF',
      };
    } else if (type === 'wait_reply') {
      initialData = {
        label: 'Aguardar Resposta',
        type,
        variableName: '',
        expectedType: 'text',
        placeholder: 'Aguardando o contato responder...',
        waitReplyTimeoutEnabled: false,
        waitReplyTimeoutValue: 15,
        waitReplyTimeoutUnit: 'minutes',
      };
    } else if (type === 'xpag_payment') {
      initialData = {
        label: 'Gerar Pagamento',
        type,
        xpagMethod: 'PIX',
        xpagSpeiMode: 'dynamic',
        xpagAmount: '50.00',
        xpagPayerName: '',
        xpagPayerEmail: '',
        xpagPayerDocument: '',
        xpagDescription: '',
        xpagWaitForPayment: true,
        xpagVariablePrefix: 'xpag',
        xpagExpirationMinutes: undefined,
      };
    } else if (type === 'delay') {
      initialData = {
        label: 'Aguardar Tempo',
        type,
        delaySeconds: 2,
        delayMode: 'duration',
        delayValue: 2,
        delayUnit: 'seconds',
        delayUntil: '',
      };
    } else if (type === 'condition') {
      initialData = {
        label: 'Condição / Se',
        type,
        conditionVariable: 'resposta',
        conditionOperator: 'contains',
        conditionValue: 'sim',
      };
    } else if (type === 'end') {
      initialData = {
        label: 'Finalizar Funil',
        type,
      };
    }

    if (type !== 'delay' && type !== 'end') {
      initialData = {
        ...initialData,
        nextDelayEnabled: false,
        nextDelayValue: 1,
        nextDelayUnit: 'seconds',
      };
    }

    const newNode: Node = {
      id,
      type,
      position: { x, y },
      data: initialData as any,
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNode({ id, type, data: initialData });
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow') as NodeType;
    if (!type || !reactFlowInstance) return;
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    handleAddNode(type, position);
  };

  // Update node data from properties panel
  const handleUpdateNodeData = (nodeId: string, newData: Partial<FlowNodeData>) => {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id === nodeId) {
          const updated = { ...node.data, ...newData };
          if (selectedNode && selectedNode.id === nodeId) {
            setSelectedNode({
              ...selectedNode,
              data: updated as FlowNodeData,
            });
          }
          return { ...node, data: updated };
        }
        return node;
      })
    );
  };

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  };

  // Save flow to backend
  const handleSaveFlow = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const startNode = nodes.find((n) => n.type === 'start');
      const triggerType = startNode?.data?.triggerType || 'all';
      const triggerKeywords = startNode?.data?.triggerKeywords || [];

      const saveUrl = accountId ? `/api/flow?accountId=${encodeURIComponent(accountId)}` : '/api/flow';
      const res = await fetch(saveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: accountId ? `flow_${accountId}` : 'flow_main',
          name: accountName ? `Fluxo - ${accountName}` : 'Fluxo WhatsApp',
          description: 'Fluxo de automação oficial',
          triggerType,
          triggerKeywords,
          nodes,
          edges,
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        if (onFlowSaved) onFlowSaved();
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Error saving flow:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportFlow = () => {
    const startNode = nodes.find((node) => node.type === 'start');
    const payload = {
      format: 'fluxozap-flow',
      version: 1,
      exportedAt: new Date().toISOString(),
      source: { accountId: accountId || 'main', accountName: accountName || 'Principal' },
      flow: {
        name: accountName ? `Fluxo - ${accountName}` : 'Fluxo WhatsApp',
        description: 'Funil exportado pelo FluxoZap',
        triggerType: startNode?.data?.triggerType || 'all',
        triggerKeywords: startNode?.data?.triggerKeywords || [],
        nodes,
        edges,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeName = (accountName || 'fluxo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    anchor.href = url;
    anchor.download = `fluxozap-${safeName || 'funil'}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setTransferMessage('Funil exportado com sucesso.');
    window.setTimeout(() => setTransferMessage(null), 3000);
  };

  const handleImportFlow = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setTransferMessage('Arquivo recusado: o JSON do funil deve ter no máximo 10 MB.');
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const imported = parsed?.format === 'fluxozap-flow' ? parsed.flow : parsed;
      if (!imported || !Array.isArray(imported.nodes) || !Array.isArray(imported.edges)) {
        throw new Error('JSON inválido: nodes e edges são obrigatórios.');
      }
      if (imported.nodes.length > 1000 || imported.edges.length > 3000) {
        throw new Error('O funil excede o limite de 1.000 blocos ou 3.000 conexões.');
      }
      const nodeIds = new Set<string>();
      for (const node of imported.nodes) {
        if (!node?.id || typeof node.id !== 'string' || !node?.type || !node?.position || typeof node.data !== 'object') {
          throw new Error('O arquivo contém um bloco inválido.');
        }
        if (nodeIds.has(node.id)) throw new Error(`ID de bloco duplicado: ${node.id}`);
        nodeIds.add(node.id);
      }
      for (const edge of imported.edges) {
        if (!edge?.id || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
          throw new Error('O arquivo contém uma conexão órfã ou inválida.');
        }
      }
      if (!imported.nodes.some((node: Node) => node.type === 'start')) throw new Error('O funil importado precisa ter um bloco de início.');
      if (!window.confirm(`Importar "${file.name}" substituirá o desenho atualmente aberto. O funil só será gravado nesta linha quando você clicar em Salvar Fluxo. Continuar?`)) return;
      setNodes(imported.nodes.map((node: Node) => ({ ...node })));
      setEdges(imported.edges.map((edge: Edge) => ({ ...edge, interactionWidth: edge.interactionWidth || 32 })));
      setSelectedNode(null);
      setSaveSuccess(false);
      setTransferMessage('Funil importado. Revise e clique em Salvar Fluxo para gravar nesta linha.');
      window.setTimeout(() => reactFlowInstance?.fitView({ padding: 0.15, duration: 300 }), 50);
    } catch (error: any) {
      setTransferMessage(error.message || 'Não foi possível importar este arquivo.');
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-50 relative overflow-hidden">
      {/* Sidebar toolbox with available node types */}
      <NodeSidebar onAddNode={handleAddNode} />

      {/* Main React Flow Canvas */}
      <div
        className="flex-1 h-full relative"
        onContextMenu={onCanvasContextMenu}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFlow} />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneClick={onPaneClick}
          onInit={setReactFlowInstance}
          fitView
          className="bg-slate-50/80"
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#cbd5e1" />
          <Controls showInteractive={false} className="!bg-white !border !border-slate-200 !shadow-sm !rounded-lg" />

          {/* Floating Action Controls */}
          <Panel position="top-right" className="flex items-center gap-2 m-4">
            {transferMessage && <span className="max-w-sm rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-sm">{transferMessage}</span>}
            <button type="button" onClick={() => importInputRef.current?.click()} className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50">
              <Upload className="w-3.5 h-3.5" /> Importar
            </button>
            <button type="button" onClick={handleExportFlow} disabled={nodes.length === 0} className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /> Exportar
            </button>
            <button
              type="button"
              onClick={handleSaveFlow}
              disabled={isSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-all ${
                saveSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Fluxo Salvo!</span>
                </>
              ) : (
                <>
                  <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
                  <span>Salvar Fluxo</span>
                </>
              )}
            </button>
          </Panel>
        </ReactFlow>
      </div>

      {/* Node Properties Panel (shows when a node is clicked) */}
      {selectedNode && (
        <NodeConfigPanel
          accountId={accountId}
          selectedNode={selectedNode}
          onUpdateData={handleUpdateNodeData}
          onDeleteNode={handleDeleteNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
};
