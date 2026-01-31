import React, { useState, useEffect, useRef } from 'react';
import SlideView from './components/SlideView';
import { SYSTEM_INSTRUCTION, safeParseModelResponse, isChunkValid, RESPONSE_SCHEMA } from './services/geminiService';
import { BoardState, BoardNode, BoardEdge, NoteSegment } from './types';
import { 
  PenTool, Loader2, Download, ChevronLeft, ChevronRight, 
  Plus, Moon, Sun, X, RotateCcw, RefreshCw,
  Mic, MicOff, Settings, PanelLeftClose, PanelLeftOpen,
  ChevronDown, ChevronUp, BookOpen, Layers
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import dagre from 'dagre';
import { jsPDF } from 'jspdf';

const createNewSlide = (title: string = 'Ready to listen'): BoardState => ({
  id: Math.random().toString(36).substring(7),
  mode: 'blank',
  title: title,
  nodes: [],
  edges: [],
  notes: [],
});

const NODE_WIDTH = 240;
const NODE_HEIGHT = 100;

const getLayoutedElements = (nodes: BoardNode[], edges: BoardEdge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  dagreGraph.setGraph({ 
    rankdir: 'TB', 
    ranksep: 220, 
    nodesep: 180, 
    marginx: 100, 
    marginy: 100 
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      x: nodeWithPosition.x - NODE_WIDTH / 2,
      y: nodeWithPosition.y - NODE_HEIGHT / 2 + 350,
    };
  });
};

function App() {
  const [isListening, setIsListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [slides, setSlides] = useState<BoardState[]>([createNewSlide('Ready to listen')]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isDeleteMenuOpen, setIsDeleteMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [collapsedNotes, setCollapsedNotes] = useState<Set<string>>(new Set());
  
  const recognitionRef = useRef<any>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedTranscript = useRef<string>("");
  const scribeEndRef = useRef<HTMLDivElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const resetCountRef = useRef(0);
  const deleteMenuRef = useRef<HTMLDivElement>(null);

  const activeSlide = slides[activeSlideIndex] || slides[0];

  useEffect(() => {
    const container = sidebarContentRef.current;
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 150;
      if (isNearBottom) {
        scribeEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [activeSlide?.notes.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(event.target as Node)) {
        setIsDeleteMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatNoteText = (text: string) => {
    let cleaned = text.trim().replace(/^[\*\-\+]\s+/, '');
    const parts = cleaned.split(/(\*\*.*?\*\*)/g);
    
    return (
      <span className="font-serif leading-[1.7] text-left block">
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong 
                key={i} 
                className="font-black" 
                style={{ color: isDarkMode ? '#ffffff' : '#000000', fontWeight: 900 }}
              >
                {part.slice(2, -2)}
              </strong>
            );
          }
          return (
            <span key={i} style={{ color: isDarkMode ? '#94a3b8' : '#000000' }}>
              {part}
            </span>
          );
        })}
      </span>
    );
  };

  const toggleNoteCollapse = (id: string) => {
    setCollapsedNotes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const stopListening = () => {
    setIsListening(false);
    setIsStarting(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { console.error(e); }
    }
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
  };

  const clearCurrentSlide = () => {
    setSlides(prev => {
      const updated = [...prev];
      const current = updated[activeSlideIndex];
      updated[activeSlideIndex] = {
        ...createNewSlide(current.title || `Class Page ${activeSlideIndex + 1}`),
        id: `wipe-${Math.random().toString(36).substring(7)}` 
      };
      return updated;
    });
    resetCountRef.current++;
    accumulatedTranscript.current = "";
    setIsDeleteMenuOpen(false);
  };

  const deleteCurrentSlide = () => {
    if (slides.length <= 1) {
      clearCurrentSlide();
      return;
    }
    setSlides(prev => {
      const newSlides = prev.filter((_, i) => i !== activeSlideIndex);
      const newIdx = Math.max(0, activeSlideIndex - 1);
      setActiveSlideIndex(newIdx);
      return newSlides;
    });
    resetCountRef.current++;
    setIsDeleteMenuOpen(false);
  };

  const resetEntireLesson = () => {
    stopListening();
    resetCountRef.current++; 
    const initialSlide = createNewSlide('Ready to listen');
    setSlides([initialSlide]);
    setActiveSlideIndex(0);
    accumulatedTranscript.current = "";
    setIsProcessing(false);
    setIsDeleteMenuOpen(false);
    setCollapsedNotes(new Set());
  };

  const processTeacherSpeech = async (text: string, retryCount = 0) => {
    if (isProcessing && retryCount === 0) return;
    const currentResetCount = resetCountRef.current;
    const targetSlideIndex = activeSlideIndex;
    setIsProcessing(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Transcript: "${text}"`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      });

      if (currentResetCount !== resetCountRef.current) return;

      const data = safeParseModelResponse(response.text);
      if (!data) {
        setIsProcessing(false);
        return;
      }

      setSlides(prevSlides => {
        if (currentResetCount !== resetCountRef.current) return prevSlides;
        const updatedSlides = [...prevSlides];
        const slide = { ...updatedSlides[targetSlideIndex] };

        const isDefaultTitle = !slide.title || slide.title.toLowerCase().includes('untitled') || slide.title === 'Ready to listen';
        if (isDefaultTitle && data.title) slide.title = data.title;

        if (data.nodes && Array.isArray(data.nodes)) {
          data.nodes.forEach((newNode: any) => {
            if (!slide.nodes.find(n => n.id === newNode.id)) {
              slide.nodes.push({ ...newNode, timestamp: Date.now(), x: 0, y: 0 });
            }
          });
        }

        if (data.edges && Array.isArray(data.edges)) {
          data.edges.forEach((newEdge: any) => {
            const edgeId = `e-${newEdge.source}-${newEdge.target}`;
            if (!slide.edges.find(e => e.id === edgeId)) {
              slide.edges.push({ ...newEdge, id: edgeId });
            }
          });
        }

        if (data.summary && data.summary.trim()) {
          slide.notes.push({ id: Math.random().toString(), text: data.summary, timestamp: Date.now() });
        }

        if (slide.nodes.length > 0) {
          slide.nodes = getLayoutedElements(slide.nodes, slide.edges);
        }

        updatedSlides[targetSlideIndex] = slide;
        return updatedSlides;
      });
      
      accumulatedTranscript.current = "";
    } catch (err: any) {
      console.error("API Error:", err);
    } finally {
      if (currentResetCount === resetCountRef.current) {
        setIsProcessing(false);
      }
    }
  };

  const handleSpeechResult = (event: any) => {
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) accumulatedTranscript.current += event.results[i][0].transcript + " ";
      else interimTranscript += event.results[i][0].transcript;
    }
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => {
      const text = (accumulatedTranscript.current + interimTranscript).trim();
      if (isChunkValid(text)) processTeacherSpeech(text);
    }, 1100);
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) return;
    setIsStarting(true);
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onstart = () => { 
        setIsListening(true); 
        setIsStarting(false);
      };
      recognition.onresult = handleSpeechResult;
      recognition.onerror = () => { 
        setIsListening(false); 
        setIsStarting(false);
      };
      recognition.onend = () => { 
        if (isListening) recognition.start();
      };
      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      setIsStarting(false);
    }
  };

  const addNewSlideManually = () => {
    setSlides(prev => {
      const nextNum = prev.length + 1;
      const newSlide = createNewSlide(`Class Page ${nextNum}`);
      const newSlides = [...prev, newSlide];
      setActiveSlideIndex(newSlides.length - 1);
      return newSlides;
    });
  };

  const exportToPdf = async () => {
    if (isListening) stopListening();
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    let yPos = 20;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(24);
    pdf.setTextColor(28, 25, 23);
    pdf.text("CHALKLESS", 20, yPos);
    yPos += 8;
    
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 100, 100);
    pdf.text("THE AI SCRIBE | REAL-TIME CLASSROOM JOURNAL", 20, yPos);
    
    const dateStr = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', month: 'long', day: 'numeric' 
    });
    pdf.text(dateStr, pageWidth - 20, yPos, { align: 'right' });
    
    yPos += 12;
    pdf.setDrawColor(220, 220, 220);
    pdf.line(20, yPos, pageWidth - 20, yPos);
    yPos += 20;

    slides.forEach((slide, index) => {
      if (yPos > 240) {
        pdf.addPage();
        yPos = 20;
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.setTextColor(28, 25, 23);
      pdf.text(`${index + 1}. ${slide.title || "Class Concept"}`, 20, yPos);
      yPos += 12;

      if (slide.nodes.length > 0) {
        pdf.setFontSize(11);
        pdf.setTextColor(80, 80, 80);
        pdf.text("LOGIC STRUCTURE", 20, yPos);
        yPos += 8;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(0, 0, 0);

        slide.edges.forEach(edge => {
          const source = slide.nodes.find(n => n.id === edge.source)?.label;
          const target = slide.nodes.find(n => n.id === edge.target)?.label;
          if (source && target) {
            const relText = `• ${source}  [${edge.label.toUpperCase()}]  >  ${target}`;
            const splitRel = pdf.splitTextToSize(relText, pageWidth - 40);
            pdf.text(splitRel, 25, yPos);
            yPos += (splitRel.length * 6);
            if (yPos > 270) {
              pdf.addPage();
              yPos = 20;
            }
          }
        });

        const connectedIds = new Set([...slide.edges.map(e => e.source), ...slide.edges.map(e => e.target)]);
        slide.nodes.forEach(node => {
          if (!connectedIds.has(node.id)) {
            pdf.text(`• ${node.label}`, 25, yPos);
            yPos += 6;
          }
        });
        yPos += 12;
      }

      if (slide.notes.length > 0) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(80, 80, 80);
        pdf.text("CLASSROOM INSIGHTS", 20, yPos);
        yPos += 8;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(40, 40, 40);

        slide.notes.forEach(note => {
          const cleanText = note.text.replace(/\*\*/g, '');
          const lines = cleanText.split('\n');
          lines.forEach(line => {
            const cleanLine = line.trim().replace(/^[\*\-\+]\s+/, '• ');
            const splitNote = pdf.splitTextToSize(cleanLine || " ", pageWidth - 40);
            if (yPos + (splitNote.length * 5) > 280) {
              pdf.addPage();
              yPos = 20;
            }
            pdf.text(splitNote, 25, yPos);
            yPos += (splitNote.length * 5) + 2;
          });
          yPos += 4;
        });
      }
      yPos += 15;
    });

    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text("Captured by Chalkless Studio", pageWidth / 2, 285, { align: 'center' });
    pdf.save(`Class_Notes_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className={`flex flex-col h-screen transition-all duration-700 overflow-hidden ${isDarkMode ? 'bg-[#0a0a0b] text-slate-100 dark' : 'bg-[#FDFBF7] text-black'}`}>
      
      {/* Premium Floating Header */}
      <header className={`h-20 flex items-center justify-between px-10 z-50 glass-effect border-b sticky top-0 transition-all ${isDarkMode ? 'bg-[#0a0a0b]/90 border-slate-800/60' : 'bg-white/80 border-slate-200/50 shadow-[0_1px_20px_rgba(0,0,0,0.02)]'}`}>
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-4 group cursor-default">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border-2 transition-all duration-500 group-hover:rotate-6 ${isDarkMode ? 'bg-white border-white shadow-[0_0_20px_rgba(255,255,255,0.15)]' : 'bg-slate-900 border-slate-900 shadow-xl'}`}>
              <span className={`text-2xl font-serif font-black select-none ${isDarkMode ? 'text-black' : 'text-white'}`}>C</span>
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-serif font-black tracking-tight leading-none uppercase">CHALKLESS</h1>
              <span className={`text-[10px] font-sans font-extrabold uppercase tracking-[0.3em] mt-1.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>THE AI SCRIBE</span>
            </div>
          </div>
          
          <div className="h-8 w-[1.5px] bg-slate-200 dark:bg-slate-800 opacity-40" />
          
          {/* Pagination - Reduced border opacity for a cleaner look */}
          <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl border transition-all ${isDarkMode ? 'bg-black border-slate-500/20 shadow-xl' : 'bg-white border-slate-950/10 shadow-sm'}`}>
             <button disabled={activeSlideIndex === 0} onClick={() => setActiveSlideIndex(activeSlideIndex - 1)} className={`p-1.5 transition-all hover:scale-110 active:scale-90 ${activeSlideIndex === 0 ? 'opacity-10 cursor-not-allowed' : 'opacity-100 hover:text-indigo-600'} ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
               <ChevronLeft size={20} strokeWidth={4} />
             </button>
             <div className={`px-3 text-[18px] font-black font-mono min-w-[90px] text-center tracking-tighter flex items-center justify-center ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
               <span className="opacity-100">{String(activeSlideIndex + 1).padStart(2, '0')}</span> 
               <span className="mx-2 opacity-100 font-black">/</span>
               <span className="opacity-100">{String(slides.length).padStart(2, '0')}</span>
             </div>
             <button disabled={activeSlideIndex === slides.length - 1} onClick={() => setActiveSlideIndex(activeSlideIndex + 1)} className={`p-1.5 transition-all hover:scale-110 active:scale-90 ${activeSlideIndex === slides.length - 1 ? 'opacity-10 cursor-not-allowed' : 'opacity-100 hover:text-indigo-600'} ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
               <ChevronRight size={20} strokeWidth={4} />
             </button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Main Scribe Button - Less distracting active state */}
          <button 
            onClick={isListening ? stopListening : startListening} 
            disabled={isStarting}
            className={`group relative flex items-center gap-4 px-8 py-3 rounded-full border-[3px] font-black text-[12px] uppercase tracking-[0.2em] transition-all duration-500 ${isListening 
              ? 'bg-slate-50 border-indigo-500 text-indigo-600 shadow-sm dark:bg-slate-900 dark:border-indigo-400 dark:text-indigo-300' 
              : 'bg-white border-slate-950 text-slate-950 hover:bg-slate-950 hover:text-white dark:bg-[#1a1a1b] dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-slate-950 shadow-xl'}`}
          >
            <div className={`h-3 w-3 rounded-full transition-all duration-300 ${isListening ? 'bg-indigo-500 animate-pulse' : 'bg-indigo-500'}`}></div>
            {isListening ? "Class in Session" : "Start Scribe"}
          </button>

          <div className="h-8 w-[1.5px] bg-slate-200 dark:bg-slate-800 opacity-40" />

          <div className="flex items-center gap-2">
            <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-3 rounded-xl transition-all ${isDarkMode ? 'hover:bg-slate-800 text-amber-400' : 'hover:bg-slate-100 text-slate-600'}`}>
              {isDarkMode ? <Sun size={20} strokeWidth={2.5} /> : <Moon size={20} strokeWidth={2.5} />}
            </button>
            <button onClick={exportToPdf} className={`p-3 rounded-xl transition-all ${isDarkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
              <Download size={20} strokeWidth={2.5} />
            </button>
            
            <div ref={deleteMenuRef} className="relative">
              <button onClick={() => setIsDeleteMenuOpen(!isDeleteMenuOpen)} className={`p-3 rounded-xl transition-all ${isDarkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
                <Settings size={20} strokeWidth={2.5} />
              </button>
              {isDeleteMenuOpen && (
                <div className={`absolute top-full right-0 mt-4 w-64 rounded-2xl border-2 shadow-2xl p-2 z-[100] glass-effect animate-fade-up ${isDarkMode ? 'bg-[#141416]/95 border-slate-800' : 'bg-white/95 border-slate-100'}`}>
                  <button onClick={clearCurrentSlide} className="w-full text-left p-3 rounded-xl flex items-center gap-4 text-xs font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"><RefreshCw size={16}/> Reset Page</button>
                  <button onClick={deleteCurrentSlide} className="w-full text-left p-3 rounded-xl flex items-center gap-4 text-xs font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"><X size={16}/> Remove Page</button>
                  <div className="h-[1.5px] bg-slate-100 dark:bg-slate-800 my-2" />
                  <button onClick={resetEntireLesson} className="w-full text-left p-3 rounded-xl flex items-center gap-4 text-xs font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"><RotateCcw size={16}/> End Session</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Modern Sidebar */}
        <aside className={`transition-all duration-700 cubic-bezier(0.16, 1, 0.3, 1) border-r flex flex-col relative z-20 overflow-hidden ${isSidebarOpen ? 'w-[400px]' : 'w-0'} ${isDarkMode ? 'bg-[#0a0a0b] border-slate-800/60' : 'bg-white/50 border-slate-200/40'}`}>
          <div className="flex-1 flex flex-col w-[400px] h-full overflow-hidden">
            <div className={`px-8 py-8 border-b flex items-center justify-between shrink-0 ${isDarkMode ? 'border-slate-800/60' : 'border-slate-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
                <h2 className={`text-xs font-black uppercase tracking-[0.3em] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Summary Notes</h2>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className={`p-2 rounded-lg transition-all ${isDarkMode ? 'hover:bg-slate-800 text-slate-500' : 'hover:bg-slate-100 text-slate-400'}`}><PanelLeftClose size={20} /></button>
            </div>
            
            <div 
              ref={sidebarContentRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar relative"
            >
              {!activeSlide || activeSlide.notes.length === 0 ? (
                <div className={`h-full flex flex-col items-center justify-center opacity-30 px-12 text-center space-y-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  <div className="p-6 rounded-full bg-slate-100 dark:bg-slate-900">
                    <BookOpen size={48} strokeWidth={1} />
                  </div>
                  <p className="text-[11px] uppercase font-black tracking-[0.25em] leading-[1.8]">Ready to listen.<br/>Start scribing to map the lecture in real time.</p>
                </div>
              ) : (
                activeSlide.notes.map((note, idx) => {
                  const isCollapsed = collapsedNotes.has(note.id);
                  const isLast = idx === activeSlide.notes.length - 1;
                  return (
                    <div key={note.id} className="animate-fade-up relative group/note">
                      <div className={`rounded-2xl border transition-all duration-500 overflow-hidden ${isDarkMode ? 'border-slate-800/40 bg-slate-900/20' : 'border-slate-100/50 bg-white/40'} ${isCollapsed ? 'max-h-14' : 'max-h-[1000px]'}`}>
                        <button 
                          onClick={() => toggleNoteCollapse(note.id)}
                          className={`w-full flex items-center justify-between p-4 text-left transition-colors ${isDarkMode ? 'hover:bg-slate-800/20' : 'hover:bg-slate-50/40'}`}
                        >
                          <span className={`text-[9px] font-black font-mono tracking-tighter uppercase opacity-40 ${isDarkMode ? 'text-slate-400' : 'text-slate-900'}`}>
                            {new Date(note.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'})}
                          </span>
                          {isCollapsed ? <ChevronDown size={12} className="opacity-30" /> : <ChevronUp size={12} className="opacity-30" />}
                        </button>
                        
                        {!isCollapsed && (
                          <div className="px-6 pb-8">
                            <div className="text-[1.2rem] leading-[1.7] text-left">
                              {formatNoteText(note.text)}
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Suble separator when collapsed or between items */}
                      {isCollapsed && !isLast && (
                        <div className={`mt-4 border-b border-dashed ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`} />
                      )}
                    </div>
                  );
                })
              )}
              <div ref={scribeEndRef} className="h-10 w-full" />
            </div>
          </div>
        </aside>

        {/* Main Infinite Canvas */}
        <main className="flex-1 relative overflow-hidden group">
          {!isSidebarOpen && (
            <button onClick={() => setIsSidebarOpen(true)} className={`absolute top-6 left-6 z-30 p-3 border rounded-2xl shadow-2xl glass-effect hover:scale-110 active:scale-95 transition-all animate-fade-up ${isDarkMode ? 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800' : 'bg-white/80 border-slate-200 text-slate-600 hover:bg-white'}`}>
              <PanelLeftOpen size={20} strokeWidth={2.5} />
            </button>
          )}
          
          <div className="absolute inset-0 z-0">
             <SlideView 
                key={activeSlide?.id} 
                boardState={activeSlide} 
                isDarkMode={isDarkMode} 
                isSidebarClosed={!isSidebarOpen}
             />
          </div>

          <div className="absolute bottom-12 right-12 z-30 flex items-center gap-6 pointer-events-none">
            {isProcessing && (
              <div className={`px-6 py-3 rounded-full border-2 shadow-2xl flex items-center gap-4 glass-effect animate-fade-up pointer-events-auto ${isDarkMode ? 'bg-indigo-950/40 border-indigo-900/30 text-indigo-100' : 'bg-indigo-50/80 border-indigo-100 text-indigo-700'}`}>
                <Loader2 className="animate-spin" size={18} />
                <span className="text-[11px] font-black uppercase tracking-[0.25em]">Scribe Writing...</span>
              </div>
            )}
            
            <button onClick={addNewSlideManually} className={`group p-4 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all pointer-events-auto flex items-center gap-3 border-2 ${isDarkMode ? 'bg-white border-white text-slate-950 shadow-white/10' : 'bg-slate-900 border-slate-900 text-white shadow-slate-900/10'}`}>
              <Plus size={18} strokeWidth={4} />
              <span className="text-[11px] font-black uppercase tracking-[0.1em]">New Page</span>
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;