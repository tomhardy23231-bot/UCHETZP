// pages/Login.jsx
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      toast.success('Добро пожаловать!');
      navigate('/');
    } catch (error) {
      console.error(error);
      toast.error('Неверный логин или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-[480px] bg-white rounded-[3rem] shadow-soft-xl border border-slate-100 overflow-hidden">
        <div className="p-12">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-blue-500 rounded-3xl flex items-center justify-center text-white mx-auto mb-6 shadow-soft-lg rotate-3">
              <Lock size={36} />
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Авторизация</h1>
            <p className="text-slate-500 font-medium italic">Система учета UC-HET-ZP</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Логин</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <User size={20} />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 font-bold"
                  placeholder="admin"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Пароль</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <Lock size={20} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 font-bold"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg hover:bg-slate-800 transition-soft shadow-soft-lg flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed mt-10"
            >
              {loading ? <Loader2 className="animate-spin" size={24} /> : 'Войти в систему'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
