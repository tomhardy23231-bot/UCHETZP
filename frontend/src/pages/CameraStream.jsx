// pages/CameraStream.jsx - Страница просмотра камеры и событий движения
import React, { useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, Activity, Clock, Shield } from 'lucide-react';
import { getMotionEvents } from '../api/client';

const CameraStream = () => {
  const [cameraIp, setCameraIp] = useState(() => {
    return localStorage.getItem('camera_ip') || '192.168.1.50';
  });
  const [motionEvents, setMotionEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streamError, setStreamError] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await getMotionEvents(20);
      setMotionEvents(data);
    } catch (error) {
      console.error('Ошибка загрузки событий движения:', error);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    // Обновляем список событий каждые 10 секунд
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const handleIpChange = (e) => {
    const newIp = e.target.value;
    setCameraIp(newIp);
    localStorage.setItem('camera_ip', newIp);
    setStreamError(false);
  };

  const refreshStream = () => {
    setStreamError(false);
    // Добавляем timestamp для обхода кэша
    const img = document.getElementById('camera-stream');
    if (img) {
      img.src = `http://${cameraIp}/stream?t=${new Date().getTime()}`;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-4xl font-black text-slate-800 flex items-center gap-3">
          <Camera size={32} className="text-blue-600" />
          Трансляция
        </h1>

        <div className="flex items-center gap-2 bg-white rounded-2xl p-2 shadow-soft">
          <Shield size={20} className="text-slate-400 ml-2" />
          <input
            type="text"
            value={cameraIp}
            onChange={handleIpChange}
            placeholder="IP адрес камеры"
            className="border-none focus:ring-0 text-slate-700 font-bold bg-transparent w-40"
          />
          <button 
            onClick={refreshStream}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-blue-600"
            title="Перезагрузить поток"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stream View */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-4 rounded-3xl shadow-soft border border-slate-100 overflow-hidden">
            <div className="relative aspect-video bg-slate-900 rounded-2xl flex items-center justify-center overflow-hidden border border-slate-200 shadow-inner">
              {!streamError ? (
                <img
                  id="camera-stream"
                  src={`http://${cameraIp}/stream`}
                  className="w-full h-full object-contain"
                  alt="Камера"
                  onError={() => setStreamError(true)}
                />
              ) : (
                <div className="text-center text-slate-400 p-8">
                  <Activity size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="font-medium text-lg">Трансляция недоступна</p>
                  <p className="text-sm">Проверьте IP адрес {cameraIp} и подключение</p>
                  <button 
                    onClick={refreshStream}
                    className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-xl shadow-soft hover:shadow-soft-lg transition-soft"
                  >
                    Повторить попытку
                  </button>
                </div>
              )}
              
              {/* Overlay labels */}
              {!streamError && (
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="bg-red-500/80 backdrop-blur-md text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-wider animate-pulse">
                    <span className="w-1.5 h-1.5 bg-white rounded-full"></span> LIVE
                  </span>
                  <span className="bg-black/40 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    ESP32-S3 Cam
                  </span>
                </div>
              )}
            </div>
            
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-emerald-500" />
                <span>Статус: {streamError ? 'Оффлайн' : 'В сети'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={16} />
                <span>{new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Motion Events List */}
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl shadow-soft border border-slate-100 flex flex-col h-[calc(100vh-200px)]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Activity size={20} className="text-orange-500" />
                Активность
              </h2>
              <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg uppercase">
                PIR Датчик
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {motionEvents.length > 0 ? (
                motionEvents.map((event) => (
                  <div key={event.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3 hover:bg-white hover:shadow-soft transition-soft group">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform">
                      <Activity size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{event.camera_name}</p>
                      <p className="text-xs text-slate-500">Движение обнаружено</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-700 text-xs">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(event.timestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <Shield size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Событий не найдено</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraStream;
