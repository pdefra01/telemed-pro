import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { supabase } from '../services/supabase';
import { User } from '../types';
import { appointmentRepository } from '../repositories/AppointmentRepository';
import { useToast } from '../context/ToastContext';
import { Save, CheckCircle, FileText, ChevronRight, ChevronLeft } from 'lucide-react';

const serverUrl = import.meta.env.VITE_LIVEKIT_URL;

interface VideoRoomProps {
  user: User;
}

const VideoRoom: React.FC<VideoRoomProps> = ({ user }) => {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Doctor Notes State
  const [notes, setNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [notesPanelOpen, setNotesPanelOpen] = useState(true);

  const isDoctor = user.role === 'doctor';

  useEffect(() => {
    const fetchToken = async () => {
      try {
        if (!appointmentId) throw new Error("ID de turno no encontrado");

        // Llamamos a la Edge Function de Supabase para producción
        const { data, error: functionError } = await supabase.functions.invoke('livekit-token', {
          body: { appointmentId }
        });

        if (functionError) {
          throw new Error(functionError.message || "Error al obtener el token de videollamada");
        }

        if (data && data.token) {
          setToken(data.token);
        } else {
          throw new Error("El servidor no devolvió un token válido");
        }
      } catch (err: any) {
        console.error("Error fetching LiveKit token:", err);
        setError(err.message);
      }
    };

    fetchToken();
  }, [appointmentId]);

  const handleSaveNotes = useCallback(async () => {
    if (!appointmentId || !notes.trim()) return;
    setIsSavingNotes(true);
    try {
      await appointmentRepository.saveAppointmentNotes(appointmentId, notes);
      toast('Notas guardadas correctamente', 'success');
    } catch (err: any) {
      console.error("Error guardando notas:", err);
      toast('Error al guardar notas', 'error');
    } finally {
      setIsSavingNotes(false);
    }
  }, [appointmentId, notes, toast]);

  const handleCompleteAppointment = useCallback(async () => {
    if (!appointmentId) return;
    setIsCompleting(true);
    try {
      // 1. Guardar notas finales si hay contenido
      if (notes.trim()) {
        await appointmentRepository.saveAppointmentNotes(appointmentId, notes);
      }
      // 2. Marcar turno como completado
      await appointmentRepository.completeAppointment(appointmentId);
      toast('Consulta finalizada exitosamente', 'success');
      // 3. Volver al dashboard
      navigate('/');
    } catch (err: any) {
      console.error("Error finalizando consulta:", err);
      toast('Error al finalizar la consulta', 'error');
      setIsCompleting(false);
    }
  }, [appointmentId, notes, navigate, toast]);

  if (!serverUrl) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center text-white">
        <div className="text-center p-8 bg-gray-800 rounded-xl border border-red-500">
          <h2 className="text-2xl font-bold mb-4 text-red-400">Error de Configuración</h2>
          <p>Falta la variable VITE_LIVEKIT_URL en tu archivo .env.local</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center text-white">
        <div className="text-center p-8 bg-gray-800 rounded-xl border border-red-500">
          <h2 className="text-2xl font-bold mb-4 text-red-400">Error de Conexión</h2>
          <p>{error}</p>
          <button 
            onClick={() => navigate(-1)}
            className="mt-4 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-white"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center text-white">
        <div className="text-center p-8 flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-teal-400 font-medium">Generando sala segura...</p>
          <p className="text-sm text-gray-400 mt-2">Conectando con el servidor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-0 rounded-xl overflow-hidden shadow-2xl border border-gray-200">
      {/* Video Area */}
      <div className={`flex-1 transition-all duration-300 ${isDoctor && notesPanelOpen ? 'mr-0' : ''}`}>
        <LiveKitRoom
          video={true}
          audio={true}
          token={token}
          serverUrl={serverUrl}
          connect={true}
          data-lk-theme="default"
          style={{ height: '100%', width: '100%' }}
          onDisconnected={() => {
            console.log("Desconectado de LiveKit");
            navigate(-1);
          }}
          onConnected={() => {
            console.log("Conectado exitosamente a LiveKit!");
          }}
          onError={(error) => {
            console.error("Error de LiveKit:", error);
          }}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>

      {/* Doctor Notes Panel — Solo visible para el médico */}
      {isDoctor && (
        <>
          {/* Toggle Button */}
          <button
            onClick={() => setNotesPanelOpen(!notesPanelOpen)}
            className="flex items-center justify-center w-6 bg-gray-100 hover:bg-gray-200 border-x border-gray-200 transition-colors"
            title={notesPanelOpen ? 'Ocultar panel' : 'Mostrar notas'}
          >
            {notesPanelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {/* Notes Panel */}
          {notesPanelOpen && (
            <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
              {/* Header */}
              <div className="p-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-teal-600" />
                  <h3 className="font-bold text-gray-800 text-sm">Notas Médicas</h3>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Turno: {appointmentId?.substring(0, 8)}...
                </p>
              </div>

              {/* Textarea */}
              <div className="flex-1 p-4">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Escribir notas médicas de la consulta..."
                  className="w-full h-full resize-none border border-gray-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
                />
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-gray-100 space-y-2">
                <button
                  onClick={handleSaveNotes}
                  disabled={isSavingNotes || !notes.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={16} />
                  {isSavingNotes ? 'Guardando...' : 'Guardar Notas'}
                </button>

                <button
                  onClick={handleCompleteAppointment}
                  disabled={isCompleting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle size={16} />
                  {isCompleting ? 'Finalizando...' : 'Finalizar Consulta'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VideoRoom;