import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import type { User } from '../store/useAuthStore';
import { Sparkles, Mail, Lock, ChevronDown, ChevronUp, User as UserIcon, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'sonner';

const Login = () => {
  const { setSession, loginReal, isLoading } = useAuthStore();
  const navigate = useNavigate();
  const [showAgents, setShowAgents] = useState(false);
  
  // Real Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // --- HARDCODED DATA (Simulasi Database) ---
  const superAdminUser: User = {
    id: 'sa-1', name: 'Super Admin', role: 'super_admin', email: 'owner@myaicustom.com'
  };

  const adminAgentUser: User = {
    id: 'aa-1', name: 'Pak Bos (Owner)', role: 'admin_agent', email: 'bos@tokomaju.com', tenantName: 'Toko Maju Jaya'
  };

  const agentUsers: User[] = [
    { id: 'ag-1', name: 'Budi (Shift Pagi)', role: 'agent', email: 'budi@tokomaju.com', tenantName: 'Toko Maju Jaya' },
    { id: 'ag-2', name: 'Siti (Shift Siang)', role: 'agent', email: 'siti@tokomaju.com', tenantName: 'Toko Maju Jaya' },
    { id: 'ag-3', name: 'Rudi (Shift Malam)', role: 'agent', email: 'rudi@tokomaju.com', tenantName: 'Toko Maju Jaya' },
  ];

  // Handle DEMO Login (Bypass)
  const handleDemoLogin = (user: User) => {
    setSession(user);
    toast.success(`(Demo) Selamat datang, ${user.name}!`);
    redirectUser(user.role);
  };

  // Handle REAL Backend Login
  const handleRealLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
        toast.error('Mohon isi email dan kata sandi');
        return;
    }

    const success = await loginReal(email, password);
    if (success) {
        // Karena backend saat ini hanya me-return role 'admin', kita asumsi dia Super Admin atau Admin Agent
        // Untuk sekarang, default ke Super Admin jika email mengandung 'admin'
        // Logic ini akan diperbaiki saat backend User Management sudah matang
        const role = email.includes('admin') ? 'super_admin' : 'admin_agent';
        redirectUser(role);
    }
  };

  const redirectUser = (role: string | null) => {
    if (role === 'super_admin') navigate('/super-admin');
    else if (role === 'admin_agent') navigate('/admin');
    else if (role === 'agent') navigate('/agent');
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left Side - Visual & Branding with Image Overlay */}
      <div className="hidden lg:flex w-5/12 relative overflow-hidden flex-col justify-between p-12 text-white">
        <div className="absolute inset-0 z-0">
            <img 
                src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2670&auto=format&fit=crop" 
                alt="Technology Background" 
                className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-blue-900/85 mix-blend-multiply"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-blue-900/50 to-blue-950/90"></div>
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center space-x-2 text-blue-200 mb-12">
            <Sparkles size={28} />
            <span className="text-xl font-bold tracking-wide">myaicustom.com</span>
          </div>
          
          <h1 className="text-4xl font-bold leading-tight mb-6">
            Kelola Tim Support <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-sky-200">
              Lebih Efisien
            </span>
          </h1>
          <p className="text-blue-100 text-lg leading-relaxed max-w-sm">
            Platform Customer Service terintegrasi WhatsApp Gateway dengan dukungan Multi-Tenant dan AI Automation.
          </p>
        </div>

        <div className="relative z-10 text-xs text-blue-300/60 mt-8">
          © 2026 myaicustom.com. Hak cipta dilindungi.
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-7/12 flex flex-col justify-center items-center p-8 bg-blue-50/30">
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl shadow-blue-100/50 border border-white">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900">Masuk</h2>
            <p className="text-gray-500 text-sm mt-2">Akses Dashboard CRM Anda</p>
          </div>

          <form className="space-y-4" onSubmit={handleRealLogin}>
            <div className="relative group">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
              <input 
                type="email" 
                placeholder="Email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
              />
            </div>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
              <input 
                type="password" 
                placeholder="Kata Sandi" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
              />
            </div>
            <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-sm shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center space-x-2"
            >
                {isLoading && <Loader2 className="animate-spin" size={16} />}
                <span>{isLoading ? 'Memproses...' : 'Masuk'}</span>
            </button>
          </form>

          {/* HIERARCHY DEMO SECTION */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
              <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-400 font-medium">Akses Demo Berjenjang</span></div>
            </div>

            <div className="mt-6 space-y-3">
              {/* 1. Super Admin */}
              <button onClick={() => handleDemoLogin(superAdminUser)} className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-green-500 bg-white group transition-all">
                <span className="text-xs font-bold text-gray-800">1. Super Admin (Pemilik Platform)</span>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded group-hover:bg-green-100 group-hover:text-green-700">Login</span>
              </button>

              {/* Connector */}
              <div className="flex justify-center -my-2"><div className="h-4 w-px bg-gray-300"></div></div>

              {/* 2. Admin Agent */}
              <button onClick={() => handleDemoLogin(adminAgentUser)} className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-500 bg-white group transition-all">
                <div className="text-left">
                  <span className="block text-xs font-bold text-gray-800">2. Admin Agen (Pemilik Toko)</span>
                  <span className="text-[10px] text-gray-400">Toko Maju Jaya</span>
                </div>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded group-hover:bg-blue-100 group-hover:text-blue-700">Login</span>
              </button>

              {/* Connector */}
              <div className="flex justify-center -my-2"><div className="h-4 w-px bg-gray-300"></div></div>

              {/* 3. User Agents Group */}
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <button 
                  onClick={() => setShowAgents(!showAgents)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-gray-700">3. User Agents (Karyawan)</span>
                    <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">3 Agen</span>
                  </div>
                  {showAgents ? <ChevronUp size={16} className="text-gray-500"/> : <ChevronDown size={16} className="text-gray-500"/>}
                </button>
                
                {/* List of 3 Specific Agents */}
                <div className={clsx("transition-all duration-300 ease-in-out bg-white", showAgents ? "max-h-60 opacity-100 border-t border-gray-100" : "max-h-0 opacity-0 overflow-hidden")}>
                  {agentUsers.map((agent) => (
                    <button 
                      key={agent.id}
                      onClick={() => handleDemoLogin(agent)}
                      className="w-full flex items-center space-x-3 p-3 hover:bg-sky-50 transition-colors text-left border-b border-gray-50 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-600">
                        <UserIcon size={14} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-800">{agent.name}</div>
                        <div className="text-[10px] text-gray-500">{agent.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Login;