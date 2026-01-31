import React, { useEffect } from 'react';
import ReactFlow, { 
  Background, 
  Node, 
  Edge, 
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  MarkerType,
  useReactFlow
} from 'reactflow';
import { BoardState } from '../types';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface SlideViewProps {
  boardState: BoardState;
  isDarkMode?: boolean;
  isSidebarClosed?: boolean;
}

const SlideViewContent: React.FC<SlideViewProps> = ({ boardState, isDarkMode = false, isSidebarClosed = false }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  useEffect(() => {
    if (!boardState || boardState.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const newNodes: Node[] = boardState.nodes.map((n) => {
      const label = n.label || '';
      const isExample = label.startsWith('[') && label.endsWith(']');
      
      return {
        id: n.id,
        data: { label: label },
        position: { x: n.x ?? 0, y: n.y ?? 0 },
        style: isExample ? {
          background: isDarkMode ? '#1a1a1a' : '#fcfcfd',
          borderRadius: '12px',
          border: isDarkMode ? '1px solid #333333' : '1px solid #e2e8f0',
          fontWeight: '500',
          padding: '14px 22px',
          fontSize: '13px',
          fontFamily: "'JetBrains Mono', monospace",
          color: isDarkMode ? '#94a3b8' : '#475569',
          width: 'auto',
          minWidth: '160px',
          textAlign: 'left',
          zIndex: 10,
          boxShadow: isDarkMode ? '0 10px 15px -3px rgba(0, 0, 0, 0.4)' : '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        } : { 
          background: isDarkMode ? '#222222' : '#ffffff', 
          borderRadius: '20px', 
          border: isDarkMode ? '1.5px solid #4a4a4a' : '1.5px solid #1c1917', 
          fontWeight: '700', 
          padding: '24px 36px',
          fontSize: '16px',
          fontFamily: 'Inter, sans-serif',
          boxShadow: isDarkMode 
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' 
            : '8px 8px 0px rgba(28, 25, 23, 0.04)',
          color: isDarkMode ? '#f1f5f9' : '#0f172a',
          width: 'auto',
          minWidth: '200px',
          textAlign: 'center',
          zIndex: 10,
        }
      };
    });

    const newEdges: Edge[] = boardState.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || "", 
      type: 'smoothstep', 
      markerEnd: { 
        type: MarkerType.ArrowClosed, 
        color: isDarkMode ? '#4b5563' : '#1e293b', 
        width: 20, 
        height: 20 
      },
      style: { 
        stroke: isDarkMode ? '#374151' : '#cbd5e1', 
        strokeWidth: 2.5, 
        opacity: isDarkMode ? 0.7 : 0.9
      },
      pathOptions: { borderRadius: 24 },
      labelStyle: { 
        fill: isDarkMode ? '#94a3b8' : '#475569', 
        fontWeight: 800, 
        fontSize: 11,
        fontFamily: 'Inter',
        textTransform: 'uppercase', 
        letterSpacing: '0.1em'
      },
      labelBgStyle: { 
        fill: isDarkMode ? '#111111' : '#ffffff', 
        fillOpacity: 1.0, 
        rx: 6, 
        ry: 6 
      },
      labelBgPadding: [10, 6],
    }));

    setNodes(newNodes);
    setEdges(newEdges);

    const timer = setTimeout(() => {
      fitView({ padding: 0.45, duration: 1200 });
    }, 250);
    return () => clearTimeout(timer);
  }, [boardState, fitView, isDarkMode, setNodes, setEdges]);

  return (
    <div className={`h-full w-full relative group/canvas`}>
      {boardState?.nodes.length > 0 ? (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          minZoom={0.05}
          maxZoom={1.5}
          fitView
          nodesDraggable={true}
          nodesConnectable={false}
          panOnDrag={true}
          zoomOnScroll={true}
          className="bg-transparent"
        >
          <Background 
            variant={BackgroundVariant.Dots} 
            color={isDarkMode ? '#262626' : '#cbd5e1'} 
            gap={48} 
            size={0.8} 
          />
        </ReactFlow>
      ) : (
        <div className="h-full w-full flex flex-col items-center justify-center relative bg-paper-texture">
          <Background 
            variant={BackgroundVariant.Dots} 
            color={isDarkMode ? '#1a1a1a' : '#e2e8f0'} 
            gap={48} 
            size={0.8} 
          />
          <div className="flex flex-col items-center text-center px-10 select-none opacity-[0.03] dark:opacity-[0.05]">
            <h3 className={`text-4xl font-serif font-black tracking-tighter uppercase ${isDarkMode ? 'text-white' : 'text-stone-900'}`}>Workspace Active</h3>
          </div>
        </div>
      )}

      {/* Modern Navigation Controls */}
      {boardState?.nodes.length > 0 && (
        <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-30 pointer-events-auto opacity-0 group-hover/canvas:opacity-100 transition-opacity duration-300">
          <button 
            onClick={() => zoomIn()} 
            className={`p-3.5 rounded-2xl border glass-effect shadow-xl hover:scale-110 active:scale-95 transition-all ${isDarkMode ? 'bg-[#1a1a1a]/90 border-stone-800 text-stone-300 hover:bg-stone-800 hover:border-stone-700' : 'bg-white/90 border-slate-200 text-slate-600 hover:bg-white hover:border-indigo-200'}`}
            title="Zoom In"
          >
            <ZoomIn size={18} />
          </button>
          <button 
            onClick={() => zoomOut()} 
            className={`p-3.5 rounded-2xl border glass-effect shadow-xl hover:scale-110 active:scale-95 transition-all ${isDarkMode ? 'bg-[#1a1a1a]/90 border-stone-800 text-stone-300 hover:bg-stone-800 hover:border-stone-700' : 'bg-white/90 border-slate-200 text-slate-600 hover:bg-white hover:border-indigo-200'}`}
            title="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>
          <button 
            onClick={() => fitView({ duration: 800, padding: 0.4 })} 
            className={`p-3.5 rounded-2xl border glass-effect shadow-xl hover:scale-110 active:scale-95 transition-all ${isDarkMode ? 'bg-[#1a1a1a]/90 border-stone-800 text-stone-300 hover:bg-stone-800 hover:border-stone-700' : 'bg-white/90 border-slate-200 text-slate-600 hover:bg-white hover:border-indigo-200'}`}
            title="Center View"
          >
            <Maximize size={18} />
          </button>
        </div>
      )}

      {/* Minimalist Header Label - Dynamically positioned to clear sidebar toggle */}
      <div className={`absolute top-12 ${isSidebarClosed ? 'left-32' : 'left-12'} z-20 flex flex-col pointer-events-none max-w-[70%] select-none transition-all duration-500`}>
        <h2 className={`text-6xl font-serif font-black tracking-tighter mb-4 animate-fade-up leading-[1.1] ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
          {boardState?.title || "New Concept"}
        </h2>
        <div className={`h-[4px] w-24 rounded-full ${isDarkMode ? 'bg-indigo-500/30' : 'bg-indigo-600/10'}`} />
      </div>
    </div>
  );
};

import { ReactFlowProvider } from 'reactflow';

const SlideView: React.FC<SlideViewProps> = (props) => (
  <ReactFlowProvider>
    <SlideViewContent {...props} />
  </ReactFlowProvider>
);

export default SlideView;