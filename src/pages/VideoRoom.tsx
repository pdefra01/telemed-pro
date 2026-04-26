import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { supabase } from '../services/supabase';

const serverUrl = import.meta.env.VITE_LIVEKIT_URL;

const VideoRoom: React.FC = () => {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="w-full h-[calc(100vh-2rem)] rounded-xl overflow-hidden shadow-2xl border border-gray-200">
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
  );
};

export default VideoRoom;