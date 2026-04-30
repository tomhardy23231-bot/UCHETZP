// components/NotificationManager.jsx
// Слушает изменения в общем контексте сегодняшних посещений и показывает toast +
// проигрывает звук, когда появляется новый приход или уход. Сам по себе НЕ опрашивает
// сервер — это делает TodayAttendanceProvider, один на всё приложение.
import React, { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useTodayAttendance } from '../context/TodayAttendanceContext';
import { UserRoundCheck, UserRoundX } from 'lucide-react';

const NotificationManager = () => {
  const { attendance } = useTodayAttendance();
  const audioRef = useRef(null);
  const isFirstLoadRef = useRef(true);
  const prevByIdRef = useRef(new Map());

  // Создаём Audio один раз, лениво (не на каждый рендер)
  if (!audioRef.current) {
    audioRef.current = new Audio('/sound.mp3');
  }

  const notify = (name, type) => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((e) => console.error('Не удалось проиграть звук:', e));
    }

    if (type === 'check-in') {
      toast.custom((t) => (
        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white shadow-soft-lg rounded-2xl pointer-events-auto flex ring-1 ring-emerald-500/20`}>
          <div className="flex-1 w-0 p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 border border-emerald-200 shadow-soft">
                  <UserRoundCheck size={24} />
                </div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-black text-slate-900">{name}</p>
                <p className="mt-1 text-sm font-bold text-emerald-600 uppercase tracking-wider">
                  ПРИХОД НА РАБОТУ
                </p>
              </div>
            </div>
          </div>
          <div className="flex border-l border-slate-100">
            <button
              onClick={() => toast.dismiss(t.id)}
              className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-sm font-black text-slate-400 hover:text-slate-600 focus:outline-none"
            >
              OK
            </button>
          </div>
        </div>
      ), { position: 'bottom-right', duration: 5000 });
    } else {
      toast.custom((t) => (
        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white shadow-soft-lg rounded-2xl pointer-events-auto flex ring-1 ring-blue-500/20`}>
          <div className="flex-1 w-0 p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 border border-slate-200 shadow-soft">
                  <UserRoundX size={24} />
                </div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-black text-slate-900">{name}</p>
                <p className="mt-1 text-sm font-bold text-slate-500 uppercase tracking-wider">
                  УШЁЛ ДОМОЙ
                </p>
              </div>
            </div>
          </div>
          <div className="flex border-l border-slate-100">
            <button
              onClick={() => toast.dismiss(t.id)}
              className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-sm font-black text-slate-400 hover:text-slate-600 focus:outline-none"
            >
              OK
            </button>
          </div>
        </div>
      ), { position: 'bottom-right', duration: 5000 });
    }
  };

  useEffect(() => {
    // Первая загрузка — просто запоминаем состояние, ничего не сигналим
    if (isFirstLoadRef.current) {
      prevByIdRef.current = new Map(attendance.map((r) => [r.id, r]));
      isFirstLoadRef.current = false;
      return;
    }

    attendance.forEach((current) => {
      const prev = prevByIdRef.current.get(current.id);
      if (!prev) {
        notify(current.employee_name, 'check-in');
      } else if (!prev.out_time && current.out_time) {
        notify(current.employee_name, 'check-out');
      }
    });

    prevByIdRef.current = new Map(attendance.map((r) => [r.id, r]));
  }, [attendance]);

  return null;
};

export default NotificationManager;
