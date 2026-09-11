// components/ScannerHealthBanner.jsx — плашка на дашборде, когда со сканером беда.
//
// Молчит, пока всё в порядке: постоянная зелёная плашка «сканер жив» быстро
// становится фоном, который перестают замечать. Появляется только тогда, когда
// есть что чинить.
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ScanLine, ChevronRight } from 'lucide-react';
import { getScannerHealth } from '../api/client';

const CHECK_MS = 60000;

const ScannerHealthBanner = () => {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const data = await getScannerHealth();
        if (!stopped) setHealth(data);
      } catch {
        // Молча: если недоступен сам API, у пользователя и так уже проблемы
        // покрупнее, а вторая красная плашка тут ничего не добавит.
      }
    };
    check();
    const timer = setInterval(check, CHECK_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, []);

  if (!health || !health.known || health.ok) return null;

  const offline = health.devices.some((d) => d.status === 'offline' || d.status === 'never');
  const tone = offline
    ? { box: 'bg-rose-50 border-rose-200', text: 'text-rose-900', icon: 'text-rose-600' }
    : { box: 'bg-amber-50 border-amber-200', text: 'text-amber-900', icon: 'text-amber-600' };

  return (
    <Link
      to="/scanner"
      className={`group flex items-start gap-3 px-4 py-3 mb-5 rounded-lg border ${tone.box} transition-colors hover:brightness-[0.98]`}
    >
      <AlertTriangle size={16} className={`${tone.icon} mt-0.5 flex-shrink-0`} />
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium ${tone.text} flex items-center gap-1.5`}>
          <ScanLine size={13} />
          {offline ? 'Сканер не на связи' : 'Сканеру нужно внимание'}
        </div>
        <ul className={`text-xs ${tone.text} opacity-80 mt-1 space-y-0.5`}>
          {health.alerts.slice(0, 3).map((a, i) => <li key={i}>· {a}</li>)}
          {health.alerts.length > 3 && (
            <li className="opacity-70">· и ещё {health.alerts.length - 3}</li>
          )}
        </ul>
      </div>
      <ChevronRight size={16} className={`${tone.icon} opacity-0 group-hover:opacity-100 transition-opacity mt-0.5`} />
    </Link>
  );
};

export default ScannerHealthBanner;
