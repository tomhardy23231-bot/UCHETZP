// pages/AdminPanel.jsx
import React, { useState, useEffect } from 'react';
import { getUsers, createAdminUser, updateUser, deleteUser } from '../api/client';
import { UserPlus, Shield, Calendar, Trash2, Clock, CheckCircle2, XCircle, ChevronRight, User } from 'lucide-react';
import toast from 'react-hot-toast';

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', subscription_until: '' });

  const fetchUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      toast.error('Ошибка загрузки пользователей');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      // Create user with 30 days sub by default if date not picked
      const subDate = newUser.subscription_until 
        ? new Date(newUser.subscription_until).toISOString() 
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      await createAdminUser({ ...newUser, subscription_until: subDate, role: 'user' });
      toast.success('Пользователь создан');
      setShowAddModal(false);
      setNewUser({ username: '', password: '', subscription_until: '' });
      fetchUsers();
    } catch (error) {
      toast.error('Ошибка создания: ' + (error.response?.data?.detail || 'Неизвестная ошибка'));
    }
  };

  const handleExtend = async (id, currentExpiry) => {
    try {
      const current = new Date(currentExpiry);
      const newExpiry = new Date(current.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await updateUser(id, { subscription_until: newExpiry });
      toast.success('Подписка продлена на 30 дней');
      fetchUsers();
    } catch (error) {
      toast.error('Ошибка продления');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить этого пользователя навсегда?')) return;
    try {
      await deleteUser(id);
      toast.success('Пользователь удален');
      fetchUsers();
    } catch (error) {
      toast.error('Ошибка удаления');
    }
  };

  const getDaysRemaining = (expiry) => {
    const diff = new Date(expiry) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  if (loading) return <div className="p-10 text-center font-bold text-slate-500">Загрузка панели...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-5xl font-black text-slate-900 tracking-tight flex items-center gap-4">
              <Shield size={48} className="text-blue-600" />
              Админ-центр
            </h1>
            <p className="text-slate-500 font-medium mt-2">Управление пользователями и подписками</p>
          </div>
          
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-soft-lg hover:bg-blue-700 transition-soft active:scale-95"
          >
            <UserPlus size={20} />
            Добавить клиента
          </button>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-[2.5rem] shadow-soft overflow-hidden border border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-8 py-6 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Пользователь</th>
                  <th className="px-8 py-6 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Статус</th>
                  <th className="px-8 py-6 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Осталось</th>
                  <th className="px-8 py-6 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => {
                  const days = getDaysRemaining(u.subscription_until);
                  const isExpired = days === 0 && u.role !== 'admin';
                  
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${u.role === 'admin' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                            {u.username[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-black text-slate-900 flex items-center gap-2">
                              {u.username}
                              {u.role === 'admin' && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full uppercase tracking-tighter font-black">ROOT</span>}
                            </p>
                            <p className="text-xs font-medium text-slate-400">ID: {u.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        {isExpired ? (
                          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-rose-100 text-rose-600 rounded-full text-xs font-black uppercase tracking-wider">
                            <XCircle size={14} /> Истекла
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-100 text-emerald-600 rounded-full text-xs font-black uppercase tracking-wider">
                            <CheckCircle2 size={14} /> Активна
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className={`text-lg font-black ${isExpired ? 'text-rose-600' : 'text-slate-900'}`}>
                            {u.role === 'admin' ? '∞' : `${days} дн.`}
                          </span>
                          <span className="text-xs font-medium text-slate-400">
                            до {new Date(u.subscription_until).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleExtend(u.id, u.subscription_until)}
                            className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-soft"
                            title="+30 дней"
                          >
                            <Clock size={18} />
                          </button>
                          {u.username !== 'admin' && (
                            <button 
                              onClick={() => handleDelete(u.id)}
                              className="p-3 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-soft"
                              title="Удалить"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
            <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10">
              <h2 className="text-3xl font-black text-slate-900 mb-8 tracking-tight">Новый доступ</h2>
              <form onSubmit={handleAddUser} className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Логин</label>
                  <input 
                    required
                    value={newUser.username}
                    onChange={e => setNewUser({...newUser, username: e.target.value})}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Пароль</label>
                  <input 
                    required
                    type="password"
                    value={newUser.password}
                    onChange={e => setNewUser({...newUser, password: e.target.value})}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Дата истечения (опц.)</label>
                  <input 
                    type="date"
                    value={newUser.subscription_until}
                    onChange={e => setNewUser({...newUser, subscription_until: e.target.value})}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>
                <div className="pt-4 flex gap-4">
                  <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold">Отмена</button>
                  <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-soft">Создать</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
