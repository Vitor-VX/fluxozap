import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
} from '@xyflow/react';
import { StartNode } from './StartNode';
import { TextNode } from './TextNode';
import { ImageNode } from './ImageNode';
import { DocumentNode } from './DocumentNode';
import { WaitReplyNode } from './WaitReplyNode';
import { DelayNode } from './DelayNode';
import { ConditionNode } from './ConditionNode';
import { NodeSidebar } from './NodeSidebar';
import { NodeConfigPanel } from './NodeConfigPanel';
import { NodeType, FlowNodeData } from '../../types/flow';
import { Save, Check, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface FlowEditorProps {
  onFlowSaved?: () => void;
}

export const FlowEditor: React.FC<FlowEditorProps> = ({ onFlowSaved }) => {
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

  // Define custom node types
  const nodeTypes = useMemo(
    () => ({
      start: StartNode,
      send_text: TextNode,
      send_image: ImageNode,
      send_document: DocumentNode,
      wait_reply: WaitReplyNode,
      delay: DelayNode,
      condition: ConditionNode,
    }),
    []
  );

  // Load flow from backend
  const loadFlow = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/flow');
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
        setEdges(data.edges || []);
      }
    } catch (err) {
      console.error('Error loading flow:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFlow();
  }, []);

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

  // Add new node of specified type
  const handleAddNode = (type: NodeType) => {
    const id = `node_${type}_${Date.now()}`;
    // Position node around center
    const x = 350 + Math.random() * 80;
    const y = 200 + Math.random() * 80;

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
        mediaUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&auto=format&fit=crop',
        caption: 'Confira nossos destaques!',
      };
    } else if (type === 'send_document') {
      initialData = {
        label: 'Enviar Documento',
        type,
        mediaUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        filename: 'apresentacao.pdf',
        caption: 'Documento informativo em PDF',
      };
    } else if (type === 'wait_reply') {
      initialData = {
        label: 'Aguardar Resposta',
        type,
        variableName: 'resposta',
        expectedType: 'text',
        placeholder: 'Aguardando o contato responder...',
      };
    } else if (type === 'delay') {
      initialData = {
        label: 'Aguardar Tempo',
        type,
        delaySeconds: 2,
      };
    } else if (type === 'condition') {
      initialData = {
        label: 'Condição / Se',
        type,
        conditionVariable: 'resposta',
        conditionOperator: 'contains',
        conditionValue: 'sim',
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

      const res = await fetch('/api/flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'flow_main',
          name: 'Fluxo WhatsApp',
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

  return (
    <div className="flex h-full w-full bg-slate-50 relative overflow-hidden">
      {/* Sidebar toolbox with available node types */}
      <NodeSidebar onAddNode={handleAddNode} />

      {/* Main React Flow Canvas */}
      <div className="flex-1 h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          className="bg-slate-50/80"
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#cbd5e1" />
          <Controls showInteractive={false} className="!bg-white !border !border-slate-200 !shadow-sm !rounded-lg" />

          {/* Floating Action Controls */}
          <Panel position="top-right" className="flex items-center gap-2 m-4">
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
          selectedNode={selectedNode}
          onUpdateData={handleUpdateNodeData}
          onDeleteNode={handleDeleteNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
};
