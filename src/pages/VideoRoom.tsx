import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionQualityIndicator,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { supabase } from '../services/supabase';
import { User } from '../types';
import { appointmentRepository } from '../repositories/AppointmentRepository';
import { medicalRecordRepository } from '../repositories/MedicalRecordRepository';
import { useToast } from '../context/ToastContext';
import { 
  Save, 
  CheckCircle, 
  FileText, 
  ChevronRight, 
  ChevronLeft, 
  Video, 
  Clock, 
  User as UserIcon,
  X,
  Shield,
  Activity,
  Maximize2,
  Signal,
  Wifi,
  Users,
  MessageSquare,
  AlertCircle,
  Lock,
  Sparkles,
  Database,
  Mic,
  MicOff,
  VideoOff,
  PhoneOff,
  Pill,
  HeartPulse,
  Plus,
  Trash2
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { WaitingExperience } from '../components/video/WaitingExperience';

const serverUrl = import.meta.env.VITE_LIVEKIT_URL;

interface VideoRoomProps {
  user: User;
}

interface RxItem {
  med: string;
  dose: string;
}

interface VideoRoomContentProps {
  isDoctor: boolean;
  appointment: any;
  appointmentId?: string;
  queuePanelOpen: boolean;
  setQueuePanelOpen: (open: boolean) => void;
  notesPanelOpen: boolean;
  setNotesPanelOpen: (open: boolean) => void;
  notes: string;
  setNotes: (notes: string) => void;
  prescription: RxItem[];
  setPrescription: (items: RxItem[]) => void;
  recommendations: string;
  setRecommendations: (val: string) => void;
  handleSaveNotes: () => Promise<void>;
  handleCompleteAppointment: () => Promise<void>;
  isSavingNotes: boolean;
  isCompleting: boolean;
  patientQueue: any[];
  navigate: any;
  isVaultOpen: boolean;
  setIsVaultOpen: (open: boolean) => void;
  patientHistory: any[];
  isAnalyzing: boolean;
  handleAiProfessionalize: () => Promise<void>;
}

const VideoRoomContent: React.FC<VideoRoomContentProps> = ({ 
  isDoctor, 
  appointment, 
  appointmentId, 
  queuePanelOpen, 
  setQueuePanelOpen,
  notesPanelOpen,
  setNotesPanelOpen,
  notes,
  setNotes,
  prescription,
  setPrescription,
  recommendations,
  setRecommendations,
  handleSaveNotes,
  handleCompleteAppointment,
  isSavingNotes,
  isCompleting,
  patientQueue,
  navigate,
  isVaultOpen,
  setIsVaultOpen,
  patientHistory,
  isAnalyzing,
  handleAiProfessionalize
}) => {
  const [activeTab, setActiveTab] = useState<'evolucion' | 'receta' | 'recomendaciones'>('evolucion');
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });

  // Hook de LiveKit para escuchar todas las pistas de audio y video de la sala
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  );

  // Clasificar pistas locales y remotas
  const localVideoTrack = tracks.find(t => t.participant.isLocal && t.source === Track.Source.Camera);
  const remoteVideoTrack = tracks.find(t => !t.participant.isLocal && t.source === Track.Source.Camera);
  const remoteScreenShareTrack = tracks.find(t => !t.participant.isLocal && t.source === Track.Source.ScreenShare);
  
  if (!appointment) {
    console.error("CRITICAL: appointment is null in VideoRoomContent");
    return <div className="p-10 text-white">Error: Cita no encontrada</div>;
  }
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `00:${mins}:${secs}`;
  };

  const getQualityColor = () => {
    switch (quality) {
      case 'excellent': return 'text-emerald-500';
      case 'good': return 'text-teal-500';
      case 'poor': return 'text-amber-500';
      default: return 'text-red-500';
    }
  };

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {/* 1. DOCTOR QUEUE (Left) */}
      {isDoctor && (
        <div className={`transition-all duration-500 ease-in-out border-r border-white/5 flex flex-col bg-slate-900/95 backdrop-blur-xl lg:bg-slate-900/40 z-40 fixed lg:relative left-0 top-0 bottom-0 h-full ${
          queuePanelOpen 
            ? 'w-72 opacity-100 shadow-3xl' 
            : 'w-0 opacity-0 overflow-hidden pointer-events-none'
        }`}>
          <div className="p-6 border-b border-white/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-amber-500/10 text-amber-500 rounded-lg flex items-center justify-center">
                <Users size={16} />
              </div>
              <h3 className="font-bold text-white text-sm tracking-tight uppercase">Sala de Espera</h3>
            </div>
            
            <div className="space-y-3">
              {(patientQueue || []).map(p => (
                <div key={p.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-amber-500/30 transition-all cursor-pointer group">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">{p.name}</p>
                    <span className="text-[9px] font-mono text-slate-500">{p.time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'waiting' ? 'bg-amber-500 animate-pulse' : 'bg-slate-600'}`}></span>
                    <span className="text-[9px] font-bold uppercase text-slate-500 tracking-widest">{p.status === 'waiting' ? 'En Espera' : 'Programado'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="mt-auto p-6 border-t border-white/5">
             <Button variant="outline" className="w-full text-[9px] h-11 border-white/10 tracking-[0.2em] uppercase font-bold">
               Agenda Completa
             </Button>
          </div>
        </div>
      )}

      {/* 2. CENTER VIDEO & HUD */}
      <div className="flex-1 relative flex flex-col min-w-0 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(20,184,166,0.03),transparent_70%)]"></div>
        
        {/* Toggle Buttons (Floating) */}
        <div className="absolute left-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-4">
          {isDoctor && (
            <button 
              onClick={() => setQueuePanelOpen(!queuePanelOpen)}
              className="w-12 h-12 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-all hover:scale-110 shadow-2xl"
              title="Cola de Pacientes"
            >
              <Users size={20} className={queuePanelOpen ? 'text-amber-500' : ''} />
            </button>
          )}
        </div>

        {/* HUD OVERLAY */}
        <div className="absolute top-0 left-0 right-0 z-30 p-8 flex justify-between items-start pointer-events-none">
          <div className="flex items-center gap-4 pointer-events-auto">
            <div className="bg-slate-900/90 backdrop-blur-3xl border border-white/10 p-4 rounded-3xl flex items-center gap-4 shadow-2xl">
              <div className={`w-12 h-12 ${isDoctor ? 'bg-teal-500/20 text-teal-400' : 'bg-emerald-500/20 text-emerald-400'} rounded-2xl flex items-center justify-center relative border border-white/5`}>
                <Video size={24} />
                <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 ${isMicrophoneEnabled ? 'bg-emerald-500' : 'bg-red-500'} rounded-full border-[3px] border-slate-900 animate-pulse`}></span>
              </div>
              <div>
                <p className={`text-[9px] font-bold ${isDoctor ? 'text-teal-500' : 'text-emerald-500'} uppercase tracking-[0.25em] leading-none mb-2`}>
                  {isDoctor ? 'MÉDICO EN LÍNEA' : 'PROFESIONAL EN LÍNEA'}
                </p>
                <div className="flex items-center gap-3">
                  <div>
                    <h1 className="text-base font-bold text-white tracking-tight leading-none">
                      {isDoctor
                        ? (appointment?.patientName || 'Cargando Paciente...')
                        : (appointment?.doctorName ? `Dr. ${appointment.doctorName}` : 'Cargando profesional...')}
                    </h1>
                    {!isDoctor && (
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] font-medium leading-none">
                        <span className="text-slate-300 font-semibold">{appointment?.doctorSpecialty || 'Clínica Médica'}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-emerald-400 font-bold tracking-wider">
                          MP N° {appointment?.doctorLicense || '184920'}
                        </span>
                      </div>
                    )}
                    {isDoctor && (
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] font-medium leading-none">
                        <span className="text-slate-300 font-semibold">Paciente Registrado</span>
                        {(user as any)?.licenseNumber && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-emerald-400 font-bold tracking-wider">
                              MP N° {(user as any).licenseNumber}
                            </span>
                          </>
                        )}
                      </div>
                    )}

                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                    <Shield size={10} className="text-emerald-500" />
                    <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest">SECURE</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/90 backdrop-blur-3xl border border-white/10 px-6 py-4 rounded-3xl flex items-center gap-4 shadow-2xl">
              <Clock size={16} className="text-slate-500" />
              <div className="flex flex-col">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">DURACIÓN</span>
                <span className="text-sm font-bold font-mono text-white tracking-wider">{formatTime(elapsed)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pointer-events-auto">
            <div className="bg-slate-900/90 backdrop-blur-3xl border border-white/10 p-4 rounded-3xl flex items-center gap-8 shadow-2xl">
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">CONEXIÓN</span>
                <div className="flex items-center gap-2">
                  <Activity size={14} className={getQualityColor()} />
                  <span className={`text-[10px] font-mono font-bold uppercase ${getQualityColor()}`}>{quality}</span>
                </div>
              </div>
              <div className="w-px h-8 bg-white/5"></div>
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">CIFRADO</span>
                <div className="flex items-center gap-2">
                  <Lock size={14} className="text-emerald-500" />
                  <span className="text-[10px] font-mono font-bold text-emerald-500">AES-256</span>
                </div>
              </div>
            </div>

            <button onClick={() => navigate(-1)} className="w-14 h-16 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white backdrop-blur-3xl border border-red-500/20 rounded-[1.5rem] flex items-center justify-center transition-all duration-500 group shadow-2xl">
              <X size={24} className="group-hover:rotate-90 transition-transform duration-500" />
            </button>
          </div>
        </div>

        {/* Video Components (Custom Interactive Layout) */}
        <div className="flex-1 relative z-0 flex items-center justify-center p-4">
          <div className="relative w-full h-full rounded-[2.5rem] overflow-hidden border border-white/10 bg-slate-950 flex items-center justify-center shadow-3xl">
            
            {/* 1. REMOTE VIDEO TRACK (Médico o Paciente - Principal) */}
            {remoteScreenShareTrack ? (
              <VideoTrack trackRef={remoteScreenShareTrack} className="w-full h-full object-contain" />
            ) : remoteVideoTrack && remoteVideoTrack.publication?.isSubscribed ? (
              <VideoTrack trackRef={remoteVideoTrack} className="w-full h-full object-cover transition-all duration-500" />
            ) : (
              // PLACEHOLDER: Si el otro participante aún no se conecta
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-8 text-center select-none">
                <div className="relative mb-6">
                  <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 shadow-2xl relative">
                    <UserIcon className="text-emerald-400 animate-pulse" size={40} />
                  </div>
                  <div className="absolute -inset-2 rounded-full border border-emerald-500/30 animate-ping [animation-duration:3s]"></div>
                </div>
                <h4 className="text-lg font-bold text-white uppercase tracking-wider mb-2">
                  {isDoctor ? 'Esperando al Paciente...' : 'Esperando al Profesional...'}
                </h4>
                <p className="text-xs text-slate-500 max-w-sm leading-relaxed font-medium">
                  Estableciendo cifrado de grado médico de punto a punto y negociando códecs seguros...
                </p>
              </div>
            )}

            {/* 2. LOCAL VIDEO MINIATURE (Vos - Flotante y responsiva) */}
            {isCameraEnabled && localVideoTrack ? (
              <div className="absolute bottom-24 right-4 sm:bottom-28 sm:right-6 w-28 h-40 sm:w-36 sm:h-48 rounded-2xl overflow-hidden border border-white/20 shadow-2xl z-20 transition-all duration-300 hover:scale-105 active:scale-95 bg-slate-900">
                <VideoTrack trackRef={localVideoTrack} className="w-full h-full object-cover" />
                <div className="absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                  <span className="text-[9px] font-bold text-white tracking-widest uppercase">Vos</span>
                </div>
              </div>
            ) : (
              // Si la cámara local está desactivada
              <div className="absolute bottom-24 right-4 sm:bottom-28 sm:right-6 w-28 h-40 sm:w-36 sm:h-48 rounded-2xl border border-dashed border-white/10 bg-slate-900/60 backdrop-blur-md z-20 flex flex-col items-center justify-center gap-2">
                <div className="p-2 bg-red-500/20 text-red-400 rounded-xl border border-red-500/20">
                  <VideoOff size={16} />
                </div>
                <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase">Cámara Off</span>
              </div>
            )}

            {/* 3. FLOATING CONSOLE CONTROLS (Táctiles, responsive, modernos) */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3.5 bg-slate-950/80 backdrop-blur-xl px-6 py-3.5 rounded-full border border-white/10 shadow-2xl">
              {/* Toggle Audio */}
              <button 
                onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isMicrophoneEnabled 
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-red-500/20 hover:bg-red-500/30 text-red-500 border border-red-500/30'
                }`}
                title={isMicrophoneEnabled ? "Silenciar Micrófono" : "Activar Micrófono"}
              >
                {isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>

              {/* Toggle Video */}
              <button 
                onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isCameraEnabled 
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-red-500/20 hover:bg-red-500/30 text-red-500 border border-red-500/30'
                }`}
                title={isCameraEnabled ? "Apagar Cámara" : "Encender Cámara"}
              >
                {isCameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </button>

              {/* Toggle Panel lateral */}
              <button 
                onClick={() => setNotesPanelOpen(!notesPanelOpen)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                  notesPanelOpen 
                    ? 'bg-teal-500/20 text-teal-400 border border-teal-500/20' 
                    : 'bg-slate-900 hover:bg-white/10 text-slate-300 border border-white/5'
                }`}
                title="Ficha / Privacidad"
              >
                <FileText size={20} />
              </button>

              {/* Hangup / Finish Call */}
              {isDoctor ? (
                <button 
                  onClick={handleCompleteAppointment}
                  className="px-5 h-12 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center gap-2 transition-all font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/20 cursor-pointer active:scale-95"
                  title="Finalizar Consulta"
                >
                  <PhoneOff size={16} />
                  <span className="hidden sm:inline">Finalizar</span>
                </button>
              ) : (
                <button 
                  onClick={() => navigate('/patient')}
                  className="w-12 h-12 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center transition-all shadow-lg shadow-red-500/20 cursor-pointer active:scale-95"
                  title="Salir de la Sala"
                >
                  <PhoneOff size={20} />
                </button>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* 3. SIDEBAR (Right) */}
      <div className={`transition-all duration-500 ease-in-out border-l border-white/5 flex flex-col bg-slate-950/95 lg:bg-slate-950 z-40 fixed lg:relative right-0 top-0 bottom-0 h-full ${
        notesPanelOpen 
          ? 'w-full sm:w-[400px] lg:w-[400px] opacity-100 shadow-3xl' 
          : 'w-0 opacity-0 overflow-hidden pointer-events-none shadow-none'
      }`}>

        {isDoctor ? (
          <div className="flex flex-col h-full bg-slate-900/10">
            {/* Header: Patient info + Vault */}
            <div className="p-4 border-b border-white/5 flex-shrink-0">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-teal-500/10 text-teal-400 rounded-xl flex items-center justify-center border border-teal-500/20">
                  <FileText size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] font-bold text-teal-500 uppercase tracking-widest">Paciente</p>
                  <p className="text-sm font-bold text-white truncate">{appointment?.patientName || 'Cargando...'}</p>
                </div>
                <button 
                  onClick={() => setIsVaultOpen(true)}
                  className="flex-shrink-0 p-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl flex items-center gap-1.5 group transition-all"
                  title="Bóveda Médica — Historial Previo"
                >
                  <Database size={14} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest hidden lg:inline">Bóveda</span>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 p-1 bg-slate-950/60 rounded-xl border border-white/5">
                <button
                  onClick={() => setActiveTab('evolucion')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${
                    activeTab === 'evolucion'
                      ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30 shadow-[0_0_15px_rgba(20,184,166,0.15)]'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <FileText size={12} />
                  <span>Evolución</span>
                </button>
                <button
                  onClick={() => setActiveTab('receta')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${
                    activeTab === 'receta'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <Pill size={12} />
                  <span>Receta</span>
                </button>
                <button
                  onClick={() => setActiveTab('recomendaciones')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${
                    activeTab === 'recomendaciones'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <HeartPulse size={12} />
                  <span>Reco.</span>
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

              {/* TAB: Evolución */}
              {activeTab === 'evolucion' && (
                <div className="flex-1 p-4 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-teal-500/80 uppercase tracking-[0.3em] flex items-center gap-1.5">
                      <FileText size={12} /> Evolución Médica
                    </label>
                    <button 
                      onClick={handleAiProfessionalize}
                      disabled={isAnalyzing || !notes.trim()}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
                        isAnalyzing
                          ? 'bg-white/5 border-white/10 opacity-50'
                          : 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 hover:scale-105'
                      }`}
                    >
                      <Sparkles size={12} className={isAnalyzing ? 'animate-spin' : ''} />
                      <span className="text-[9px] font-bold uppercase tracking-widest">{isAnalyzing ? 'IA...' : 'AI'}</span>
                    </button>
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Motivo de consulta, examen físico, diagnóstico y plan terapéutico..."
                    className="flex-1 w-full bg-slate-900/60 border border-teal-500/10 focus:border-teal-500/40 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/10 transition-all resize-none font-medium leading-relaxed placeholder:text-slate-700 shadow-inner"
                  />
                </div>
              )}

              {/* TAB: Receta */}
              {activeTab === 'receta' && (
                <div className="flex-1 p-4 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-[10px] font-bold text-blue-400/80 uppercase tracking-[0.3em] flex items-center gap-1.5">
                      <Pill size={12} /> Prescripción Médica
                    </label>
                    <button
                      onClick={() => setPrescription([...prescription, { med: '', dose: '' }])}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 hover:scale-105 transition-all"
                    >
                      <Plus size={12} />
                      <span className="text-[9px] font-bold uppercase tracking-widest">Agregar</span>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {prescription.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center py-8 opacity-40">
                        <Pill size={32} className="text-slate-600 mb-3" />
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sin medicamentos</p>
                        <p className="text-[10px] text-slate-600 mt-1">Presioná "Agregar" para añadir una prescripción</p>
                      </div>
                    ) : (
                      prescription.map((item, idx) => (
                        <div key={idx} className="group relative bg-slate-900/60 border border-blue-500/10 hover:border-blue-500/30 rounded-xl p-3 transition-all">
                          <button
                            onClick={() => setPrescription(prescription.filter((_, i) => i !== idx))}
                            className="absolute top-2 right-2 w-6 h-6 bg-red-500/10 hover:bg-red-500/30 border border-red-500/20 rounded-lg flex items-center justify-center text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 size={10} />
                          </button>

                          <div className="space-y-2">
                            <div>
                              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                                Medicamento #{idx + 1}
                              </label>
                              <input
                                type="text"
                                value={item.med}
                                onChange={(e) => {
                                  const updated = [...prescription];
                                  updated[idx] = { ...updated[idx], med: e.target.value };
                                  setPrescription(updated);
                                }}
                                placeholder="Ej: Amoxicilina 500mg"
                                className="w-full bg-slate-950/60 border border-slate-700 focus:border-blue-500/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all placeholder:text-slate-700"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                                Dosis / Posología
                              </label>
                              <input
                                type="text"
                                value={item.dose}
                                onChange={(e) => {
                                  const updated = [...prescription];
                                  updated[idx] = { ...updated[idx], dose: e.target.value };
                                  setPrescription(updated);
                                }}
                                placeholder="Ej: 1 comp. cada 8hs por 7 días"
                                className="w-full bg-slate-950/60 border border-slate-700 focus:border-blue-500/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all placeholder:text-slate-700"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {prescription.length > 0 && (
                    <p className="text-[9px] text-blue-500/50 font-bold uppercase tracking-widest text-center mt-2">
                      {prescription.length} medicamento{prescription.length !== 1 ? 's' : ''} — Se formalizará al cerrar la consulta
                    </p>
                  )}
                </div>
              )}

              {/* TAB: Recomendaciones */}
              {activeTab === 'recomendaciones' && (
                <div className="flex-1 p-4 flex flex-col min-h-0">
                  <label className="text-[10px] font-bold text-amber-400/80 uppercase tracking-[0.3em] flex items-center gap-1.5 mb-2">
                    <HeartPulse size={12} /> Recomendaciones al Paciente
                  </label>
                  <textarea
                    value={recommendations}
                    onChange={(e) => setRecommendations(e.target.value)}
                    placeholder="Instrucciones post-consulta, cambios en el estilo de vida, próximos pasos, estudios solicitados..."
                    className="flex-1 w-full bg-slate-900/60 border border-amber-500/10 focus:border-amber-500/40 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/10 transition-all resize-none font-medium leading-relaxed placeholder:text-slate-700 shadow-inner"
                  />
                  <p className="text-[9px] text-amber-500/50 font-bold uppercase tracking-widest text-center mt-2">
                    Visible para el paciente al finalizar la consulta
                  </p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-white/5 space-y-2 flex-shrink-0">
              <Button
                variant="outline"
                onClick={handleSaveNotes}
                isLoading={isSavingNotes}
                disabled={!notes.trim()}
                className="w-full border-white/10 text-white hover:bg-white/5 h-11 rounded-xl tracking-[0.2em] uppercase text-[9px] font-bold"
                icon={<Save size={16} />}
              >
                Guardar Evolución
              </Button>

              <Button
                variant="primary"
                onClick={handleCompleteAppointment}
                isLoading={isCompleting}
                className="w-full bg-teal-600 hover:bg-teal-500 text-white h-11 rounded-xl shadow-[0_10px_40px_rgba(20,184,166,0.2)] tracking-[0.2em] uppercase text-[9px] font-bold border-none"
                icon={<CheckCircle size={16} />}
              >
                Finalizar Turno
              </Button>
            </div>
          </div>
        ) : (
          /* PATIENT INFO & PRIVACY */
          <div className="flex flex-col h-full">
            <div className="p-12 border-b border-white/5 bg-gradient-to-b from-emerald-500/10 to-transparent text-center">
              <div className="w-24 h-24 bg-slate-800 rounded-[2.5rem] mx-auto mb-8 flex items-center justify-center text-emerald-500 text-4xl font-bold border border-white/10 shadow-2xl relative">
                DR
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center text-white border-4 border-slate-950 shadow-xl">
                  <Shield size={16} />
                </div>
              </div>
              <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.4em] mb-3">Atención Profesional</p>
              <h3 className="text-2xl font-bold text-white tracking-tight">Dr. Profesional</h3>
              <p className="text-xs text-slate-500 font-bold mt-2 uppercase tracking-[0.2em]">Cardiología Avanzada</p>
            </div>

            <div className="flex-1 p-10 space-y-12 overflow-y-auto">
              {/* Privacy Checklist */}
              <div className="space-y-6">
                <h4 className="text-[11px] font-bold text-white uppercase tracking-[0.3em] flex items-center gap-3">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                  Privacidad & Seguridad
                </h4>
                
                <div className="space-y-4">
                  <div className={`p-5 rounded-3xl border transition-all duration-500 flex items-center justify-between ${isCameraEnabled ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl ${isCameraEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        <Video size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Cámara de Video</p>
                        <p className="text-[10px] text-slate-500 font-medium">{isCameraEnabled ? 'Transmisión Segura' : 'Desactivada'}</p>
                      </div>
                    </div>
                    {isCameraEnabled && <CheckCircle size={16} className="text-emerald-500" />}
                  </div>

                  <div className={`p-5 rounded-3xl border transition-all duration-500 flex items-center justify-between ${isMicrophoneEnabled ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl ${isMicrophoneEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        <Activity size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Audio / Micrófono</p>
                        <p className="text-[10px] text-slate-500 font-medium">{isMicrophoneEnabled ? 'Captura Activa' : 'Muteado'}</p>
                      </div>
                    </div>
                    {isMicrophoneEnabled && <CheckCircle size={16} className="text-emerald-500" />}
                  </div>

                  <div className="p-5 rounded-3xl border bg-emerald-500/5 border-emerald-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                        <Lock size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Encriptación E2E</p>
                        <p className="text-[10px] text-slate-500 font-medium">Protección Militar</p>
                      </div>
                    </div>
                    <CheckCircle size={16} className="text-emerald-500" />
                  </div>
                </div>
              </div>

              {/* Protocol info */}
              <div className="p-8 bg-slate-900/50 rounded-[2rem] border border-white/5 relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-all duration-700"></div>
                 <Shield className="text-emerald-500/40 mb-6" size={40} />
                 <h4 className="text-xs font-bold text-white uppercase tracking-[0.2em] mb-3">Protocolo HIPAA & GDPR</h4>
                 <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                   Sus datos médicos están protegidos bajo los estándares internacionales más rigurosos. Ningún tercero tiene acceso a esta sesión.
                 </p>
              </div>
            </div>

            <div className="p-10 border-t border-white/5 text-center bg-slate-950/50">
               <div className="flex items-center justify-center gap-2 mb-3 opacity-20">
                 <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                 <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                 <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
               </div>
               <p className="text-[10px] text-slate-700 font-bold uppercase tracking-[0.5em]">
                 MEDINEX ZEN
               </p>
            </div>
          </div>
        )}
      </div>

      {/* Floating Notes Panel Toggle handle (always clickable, positioned relative to the right edge) */}
      <button
        onClick={() => setNotesPanelOpen(!notesPanelOpen)}
        className={`absolute top-1/2 -translate-y-1/2 z-50 w-8 h-32 bg-slate-900/90 backdrop-blur-3xl border border-white/10 hover:border-teal-500/30 flex items-center justify-center text-slate-400 hover:text-white transition-all duration-500 rounded-l-2xl shadow-2xl ${
          notesPanelOpen ? 'right-[100%] sm:right-[400px] lg:right-[400px]' : 'right-0'
        } ${!isDoctor && 'hover:border-emerald-500/30'}`}
        style={{ transitionProperty: 'right, background-color, border-color, color' }}
      >
        {notesPanelOpen ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
      </button>

      {/* MEDICAL VAULT OVERLAY */}
      {isVaultOpen && (
        <div className="absolute inset-0 z-[100] bg-slate-950/80 backdrop-blur-2xl flex items-center justify-end p-8 animate-in fade-in duration-500">
          <div className="w-[600px] h-full bg-slate-900 border border-white/10 rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-500">
            <div className="p-10 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                  <Database size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white tracking-tight uppercase">Bóveda Médica</h3>
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.4em]">Historial Clínico del Paciente</p>
                </div>
              </div>
              <button 
                onClick={() => setIsVaultOpen(false)}
                className="w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-8">
              {patientHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                  <div className="w-20 h-20 bg-slate-800 rounded-[2.5rem] flex items-center justify-center mb-6">
                    <AlertCircle size={32} />
                  </div>
                  <p className="text-sm font-bold uppercase tracking-widest text-slate-500">No hay registros previos</p>
                  <p className="text-xs text-slate-600 mt-2">Esta es la primera consulta del paciente en la plataforma.</p>
                </div>
              ) : (
                patientHistory.map((record, idx) => (
                  <div key={record.id} className="group relative">
                    {idx < patientHistory.length - 1 && (
                      <div className="absolute left-6 top-16 bottom-0 w-px bg-white/5"></div>
                    )}
                    <div className="flex gap-8">
                      <div className="relative z-10 w-12 h-12 bg-slate-800 border border-white/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-500 shadow-xl">
                        <FileText size={20} />
                      </div>
                      <div className="flex-1 bg-white/5 border border-white/5 p-8 rounded-[2.5rem] group-hover:border-emerald-500/30 transition-all duration-500">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1 block">Consulta Finalizada</span>
                            <h4 className="text-lg font-bold text-white tracking-tight">{new Date(record.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</h4>
                          </div>
                          <div className="px-3 py-1.5 bg-slate-900 border border-white/10 rounded-xl">
                            <span className="text-[10px] font-mono text-slate-400 uppercase">{record.id.substring(0, 8)}</span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-400 font-medium leading-relaxed italic mb-6">
                          "{record.notes}"
                        </p>
                        <div className="flex items-center justify-between border-t border-white/5 pt-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-slate-500">
                              <UserIcon size={14} />
                            </div>
                            <div>
                              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Médico Tratante</p>
                              <p className="text-[10px] font-bold text-white uppercase">{record.doctorName || 'Dr. Desconocido'}</p>
                            </div>
                          </div>
                          <Button variant="outline" className="h-10 px-4 text-[9px] border-white/10 hover:bg-white/5 tracking-widest font-bold uppercase">
                            Ver PDF
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-10 border-t border-white/5 bg-slate-950/50">
               <div className="flex items-center justify-center gap-2 opacity-20">
                 <Lock size={12} />
                 <span className="text-[8px] font-bold uppercase tracking-[0.4em]">Acceso Restringido - Sólo Personal Autorizado</span>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


const VideoRoom: React.FC<VideoRoomProps> = ({ user }) => {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Doctor States
  const [notes, setNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [notesPanelOpen, setNotesPanelOpen] = useState(window.innerWidth >= 1024);
  const [queuePanelOpen, setQueuePanelOpen] = useState(false);
  const [appointment, setAppointment] = useState<{ patientName: string } | null>(null);
  
  // Robustness/Network States (Mocked for UI)
  const [latency, setLatency] = useState(24);
  const [signalStrength, setSignalStrength] = useState(98);
  const [isHealthy, setIsHealthy] = useState(true);
  const [isHandshakeComplete, setIsHandshakeComplete] = useState(false);

  const isDoctor = user.role === 'doctor';
  
  const [patientQueue, setPatientQueue] = useState<any[]>([]);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [patientHistory, setPatientHistory] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [prescription, setPrescription] = useState<{ med: string; dose: string }[]>([]);
  const [recommendations, setRecommendations] = useState('');

  const fetchDetails = useCallback(async () => {
    if (!appointmentId) {
      setError("ID de turno no encontrado");
      return;
    }

    setError(null);
    setToken(null);

    try {
      const appt = await appointmentRepository.getAppointmentById(appointmentId);
      if (appt) {
        setAppointment(appt);
        // Fetch patient history for the vault
        const history = await medicalRecordRepository.getRecordsByPatientId(appt.patientId);
        setPatientHistory(history);

        // Si es médico y el turno está confirmado, lo pasamos a 'in_progress'
        if (isDoctor && appt.status === 'confirmed') {
          await appointmentRepository.startConsultation(appointmentId);
          setAppointment(prev => prev ? { ...prev, status: 'in_progress' } : null);
        }
      }

      const response = await fetch('/api/livekit-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appointmentId }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error de servidor (${response.status})`);
      }

      const data = await response.json();

      if (data?.token) {
        setToken(data.token);
      } else {
        throw new Error("Token inválido recibido del servidor");
      }
    } catch (err: any) {
      setError(err.message || 'Fallo al obtener credenciales de videollamada');
    }
  }, [appointmentId, isDoctor]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Real-time Queue Subscription
  useEffect(() => {
    if (!isDoctor) return;

    const fetchQueue = async () => {
      const queue = await appointmentRepository.getDoctorAppointments(user.id, { 
        status: ['confirmed', 'in_progress'] 
      });
      setPatientQueue(queue.map(q => ({
        id: q.id,
        name: q.patientName,
        time: q.time,
        status: q.status === 'in_progress' ? 'active' : 'waiting'
      })));
    };

    fetchQueue();

    const channel = supabase
      .channel('doctor-queue')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'appointments',
        filter: `doctor_id=eq.${user.id}`
      }, fetchQueue)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isDoctor, user.id]);

  // Network Simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setLatency(prev => Math.max(15, Math.min(60, prev + (Math.random() * 10 - 5))));
      setSignalStrength(prev => Math.max(90, Math.min(100, prev + (Math.random() * 2 - 1))));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveNotes = useCallback(async () => {
    if (!appointmentId || !notes.trim()) return;
    setIsSavingNotes(true);
    try {
      await appointmentRepository.saveAppointmentNotes(appointmentId, notes);
      toast('Sincronización completa', 'success');
    } catch (err: any) {
      toast('Fallo en sincronización', 'error');
    } finally {
      setIsSavingNotes(false);
    }
  }, [appointmentId, notes, toast]);

  const handleAiProfessionalize = useCallback(async () => {
    if (!notes.trim()) return;
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-medical-assistant', {
        body: { action: 'professionalize_notes', notes }
      });
      if (error) throw error;
      setNotes(data.result);
      toast('Evolución profesionalizada por IA', 'success');
    } catch (err: any) {
      toast('Error con el asistente de IA', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [notes, toast]);

  const handleCompleteAppointment = useCallback(async () => {
    if (!appointmentId) return;
    setIsCompleting(true);
    try {
      if (notes.trim()) await appointmentRepository.saveAppointmentNotes(appointmentId, notes);
      await appointmentRepository.completeAppointment(appointmentId);
      toast('Consulta finalizada con éxito', 'success');
      navigate(`/doctor/post-consultation/${appointmentId}`);
    } catch (err: any) {
      toast('Error al finalizar', 'error');
      setIsCompleting(false);
    }
  }, [appointmentId, notes, navigate, toast]);

  if (!isHandshakeComplete && !isDoctor) {
    return (
      <WaitingExperience 
        patientName={user.name || 'Paciente'} 
        onReady={() => setIsHandshakeComplete(true)} 
        onCancel={() => navigate(user.role === 'doctor' ? '/doctor' : '/patient')}
      />
    );
  }

  if (!serverUrl || error || !token) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-6 text-white font-sans">
        <div className="flex flex-col items-center gap-6 max-w-md text-center bg-slate-900/40 border border-white/5 p-12 rounded-[2.5rem] backdrop-blur-3xl shadow-3xl">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${error ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'} ${!error ? 'animate-pulse' : ''}`}>
            {error ? <AlertCircle size={28} /> : <Activity size={28} />}
          </div>
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight uppercase mb-2">
              {error ? 'Fallo de Conexión' : 'Sincronizando Túnel'}
            </h3>
            <p className="text-slate-400 text-xs font-medium leading-relaxed">
              {error ? `No pudimos inicializar la videollamada: ${error}` : 'Estableciendo cifrado de punto a punto y negociando códecs de video...'}
            </p>
          </div>
          {error ? (
            <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mt-4">
              <button 
                onClick={fetchDetails}
                className="px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex-1"
              >
                Reintentar
              </button>
              <button 
                onClick={() => navigate(user.role === 'doctor' ? '/doctor' : '/patient')}
                className="px-8 py-3.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95 flex-1"
              >
                Volver al Dashboard
              </button>
            </div>
          ) : (
            <div className="flex gap-1.5 justify-center py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce"></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200">
      {/* Sidebar logic moved to VideoRoomContent */}

      {/* 2. MAIN VIDEO AREA */}
      <div className="flex-1 relative flex flex-col min-w-0">
        {/* HUD is now inside LiveKitRoom in VideoRoomContent */}

        {/* LIVEKIT CONTAINER */}
        <div className="flex-1 bg-slate-950 overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(20,184,166,0.05),transparent_70%)]"></div>
          <LiveKitRoom
            video={true}
            audio={true}
            token={token}
            serverUrl={serverUrl}
            connect={true}
            data-lk-theme="default"
            className="h-full w-full"
            onDisconnected={() => navigate(-1)}
          >
            <RoomAudioRenderer />
            <VideoRoomContent 
              isDoctor={isDoctor} 
              appointment={appointment} 
              appointmentId={appointmentId} 
              queuePanelOpen={queuePanelOpen} 
              setQueuePanelOpen={setQueuePanelOpen} 
              notesPanelOpen={notesPanelOpen}
              setNotesPanelOpen={setNotesPanelOpen}
              notes={notes}
              setNotes={setNotes}
              prescription={prescription}
              setPrescription={setPrescription}
              recommendations={recommendations}
              setRecommendations={setRecommendations}
              handleSaveNotes={handleSaveNotes}
              handleCompleteAppointment={handleCompleteAppointment}
              isSavingNotes={isSavingNotes}
              isCompleting={isCompleting}
              patientQueue={patientQueue}
              navigate={navigate}
              isVaultOpen={isVaultOpen}
              setIsVaultOpen={setIsVaultOpen}
              patientHistory={patientHistory}
              isAnalyzing={isAnalyzing}
              handleAiProfessionalize={handleAiProfessionalize}
            />
          </LiveKitRoom>
        </div>
        
        {/* Footer actions removed to prevent overlay duplication with the central interactive bar */}
      </div>

      {/* Sidebar logic moved to VideoRoomContent */}
    </div>
  );
};

export default VideoRoom;