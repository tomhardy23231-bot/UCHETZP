// pages/Login.jsx — вход в систему (Linear-стиль, mobile-friendly)
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Lock, User, Eye, EyeOff, Loader2, Building2,
  CalendarDays, Wallet, Timer,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../components/ui/Button';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const user = await login(username, password);
      toast.success('Добро пожаловать!');
      navigate(user.role === 'admin' ? '/' : '/cabinet');
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || 'Неверный логин или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo + заголовок */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center mb-4">
            <Building2 size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Личный кабинет</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">
            Учёт рабочего времени и зарплаты
          </p>
        </div>

        {/* Что внутри — 3 пункта */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Внутри вы увидите
          </p>
          <div className="space-y-2.5">
            <FeatureRow
              icon={<CalendarDays size={16} />}
              title="Календарь смен"
              desc="Когда вы приходили и уходили — все ваши смены за месяц"
            />
            <FeatureRow
              icon={<Wallet size={16} />}
              title="Расчёт зарплаты"
              desc="Сколько отработано и сколько начислено за месяц"
            />
            <FeatureRow
              icon={<Timer size={16} />}
              title="Статистика"
              desc="Часы, премии, авансы, штрафы и итог к выплате"
            />
          </div>
        </div>

        {/* Card с формой логина */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">
                Логин
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.trim())}
                  className="w-full h-10 pl-9 pr-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="ivanov"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">
                Пароль
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-10 pl-9 pr-10 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : 'Войти'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          Логин и пароль выдаёт администратор.<br />
          Нет доступа? Обратитесь к нему.
        </p>
      </div>
    </div>
  );
};

const FeatureRow = ({ icon, title, desc }) => (
  <div className="flex items-start gap-3">
    <div className="w-7 h-7 bg-slate-100 rounded-md flex items-center justify-center text-slate-600 flex-shrink-0 mt-0.5">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-slate-800 leading-tight">{title}</p>
      <p className="text-xs text-slate-500 leading-snug mt-0.5">{desc}</p>
    </div>
  </div>
);

export default Login;
