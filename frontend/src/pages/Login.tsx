import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { Mail, Lock, ChevronDown, ChevronUp, User as UserIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const Login = () => {
  const navigate = useNavigate();
  const { login, isLoading: authLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showAgents, setShowAgents] = useState(false);

  const adminAgentUser = { 
    email: 'admin@tokomaju.com', 
    role: 'admin_agent' as const, 
    id: 'tenant-admin', 
    name: 'Admin Toko Maju' 
  };
  
  const agents = [
    { email: 'siti@tokomaju.com', name: 'Siti Aminah', id: 'agent-1' },
    { email: 'budi@tokomaju.com', name: 'Budi Santoso', id: 'agent-2' },
    { email: 'dewi@tokomaju.com', name: 'Dewi Lestari', id: 'agent-3' },
  ];

  const handleDemoLogin = (user: any) => {
    // Manually set the auth state for demo purposes
    useAuthStore.setState({
      user: { ...user, isDemo: true },
      isAuthenticated: true,
      token: 'demo-token-' + Math.random().toString(36).substring(7)
    });

    toast.success(`Selamat datang (Demo), ${user.name}!`);

    // Navigate based on role
    if (user.role === 'super_admin') navigate('/super-admin');
    else if (user.role === 'admin_agent') navigate('/admin');
    else navigate('/agent');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
        toast.error('Mohon isi email dan kata sandi');
        return;
    }

    try {
        const success = await login(email, password);
        if (success) {
            const role = email.includes('admin') ? 'super_admin' : 'admin_agent';
            if (role === 'super_admin') navigate('/super-admin');
            else navigate('/admin');
        }
    } catch (error: any) {
        toast.error(error.message || 'Gagal masuk');
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex">
      {/* Left Side - Visual & Branding */}
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
          <div className="flex items-center space-x-3 text-blue-200 mb-12">
            <img src="/logo.png" alt="CRM SaaS" className="h-10 w-10 rounded-xl object-contain" />
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
      <div className="w-full lg:w-7/12 flex flex-col justify-center items-center p-8 bg-blue-50/30 dark:bg-slate-950">
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl shadow-blue-100/50 dark:shadow-blue-900/30 border border-white dark:border-slate-800">
          <div className="text-center mb-10">
            <img src="/logo.png" alt="CRM SaaS" className="mx-auto h-12 w-12 rounded-2xl object-contain mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Masuk</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Akses Dashboard CRM Anda</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="relative group">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 group-focus-within:text-blue-600 transition-colors" size={18} />
              <input 
                type="email" 
                placeholder="Email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
              />
            </div>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 group-focus-within:text-blue-600 transition-colors" size={18} />
              <input 
                type="password" 
                placeholder="Kata Sandi" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
              />
            </div>
            <button 
                type="submit" 
                disabled={authLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-sm shadow-lg shadow-blue-200 dark:shadow-blue-900/30 transition-all active:scale-95 flex items-center justify-center space-x-2"
            >
                {authLoading && <Loader2 className="animate-spin" size={16} />}
                <span>{authLoading ? 'Memproses...' : 'Masuk'}</span>
            </button>
          </form>

          {/* HIERARCHY DEMO SECTION */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-slate-700"></div></div>
              <div className="relative flex justify-center text-sm"><span className="px-2 bg-white dark:bg-slate-900 text-gray-400 dark:text-gray-500 font-medium">Akses Demo Berjenjang</span></div>
            </div>

            <div className="mt-6 space-y-3">
              {/* Super Admin Option (Hidden subtle) */}
              <button 
                onClick={() => handleDemoLogin({ email: 'admin@localhost', role: 'super_admin', id: 'system-admin', name: 'Super Admin' })}
                className="w-full text-[10px] text-gray-300 dark:text-gray-500 hover:text-blue-400 dark:hover:text-blue-300 transition-colors py-1"
              >
                Login as System Super Admin
              </button>

              {/* 1. Admin Agent */}
              <button onClick={() => handleDemoLogin(adminAgentUser)} className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-blue-500 bg-white dark:bg-slate-800 group transition-all">
                <div className="text-left">
                  <span className="block text-xs font-bold text-gray-800 dark:text-gray-100">1. Admin Agen (Pemilik Toko)</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">Toko Maju Jaya</span>
                </div>
                <span className="text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-300 px-2 py-1 rounded group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 group-hover:text-blue-700 dark:group-hover:text-blue-300">Login</span>
              </button>

              {/* 2. User Agents Group */}
              <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
                <button 
                  onClick={() => setShowAgents(!showAgents)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/60 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200">2. User Agents (Karyawan)</span>
                    <span className="text-[10px] bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-200 px-2 py-0.5 rounded-full">3 Agen</span>
                  </div>
                  {showAgents ? <ChevronUp size={16} className="text-gray-500 dark:text-gray-400"/> : <ChevronDown size={16} className="text-gray-500 dark:text-gray-400"/>}
                </button>
                
                {showAgents && (
                  <div className="p-2 space-y-2 bg-gray-50 dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700">
                    {agents.map((agent: any) => (
                      <button 
                        key={agent.id} 
                        onClick={() => handleDemoLogin({ ...agent, role: 'agent' })}
                        className="w-full flex items-center space-x-3 p-2 rounded-md hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-slate-600 transition-all text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-300">
                          <UserIcon size={14} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-gray-800 dark:text-gray-100">{agent.name}</div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">{agent.email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
