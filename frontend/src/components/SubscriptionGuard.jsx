// components/SubscriptionGuard.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, CreditCard, MessageCircle } from 'lucide-react';
import axios from 'axios';

const SubscriptionGuard = ({ children }) => {
  const { user, logout } = useAuth();
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      const expiryDate = new Date(user.subscription_until);
      const now = new Date();
      if (expiryDate < now) {
        setIsExpired(true);
      }
    } else {
      setIsExpired(false);
    }
  }, [user]);

  // Intercept 403 globally via axios interceptor if needed, 
  // but the date check above is primary for the overlay.

  if (isExpired) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
        {/* Blurred Background */}
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" />
        
        {/* Overlay Card */}
        <div className="relative bg-white w-full max-w-lg mx-4 rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="p-10 text-center">
            <div className="w-20 h-20 bg-rose-100 rounded-3xl flex items-center justify-center text-rose-600 mx-auto mb-8 shadow-soft">
              <Lock size={40} />
            </div>
            
            <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">
              Доступ ограничен
            </h2>
            
            <p className="text-slate-500 font-medium mb-8 leading-relaxed">
              Срок действия вашей подписки истек. <br />
              Стоимость продления: <span className="text-slate-900 font-bold">500 грн / месяц</span>.
            </p>
            
            <div className="bg-slate-50 rounded-3xl p-6 mb-8 border border-slate-100 text-left">
              <div className="flex items-start gap-4 mb-4">
                <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
                  <CreditCard size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Номер карты для оплаты</p>
                  <p className="text-xl font-black text-slate-900 tracking-wider">5168 7520 0877 5721</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600">
                  <MessageCircle size={20} />
                </div>
                <p className="text-sm font-medium text-slate-600">
                  После оплаты сообщите администратору для мгновенной активации аккаунта.
                </p>
              </div>
            </div>
            
            <button 
              onClick={logout}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-soft shadow-soft-lg"
            >
              Выйти из системы
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

export default SubscriptionGuard;
