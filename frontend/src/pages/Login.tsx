import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bot, Check, ChevronDown, ChevronUp, Eye, EyeOff, Loader2, Lock, Mail, MessageCircle, ShieldCheck, Sparkles, User as UserIcon, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../store/useAuthStore';
import BrandLogo from '../components/BrandLogo';

const Login = () => {
  const navigate = useNavigate();
  const { login, loginDemo, isLoading: authLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showAgents, setShowAgents] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const showDemoAccess = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';

  const adminAgentUser = { email: 'admin@tokomaju.com', role: 'admin_agent' as const, id: 'tenant-admin', name: 'Owner Toko Maju', tenant_name: 'Toko Maju Jaya' };
  const agents = [
    { email: 'siti@tokomaju.com', name: 'Siti Aminah', id: 'agent-1', tenant_name: 'Toko Maju Jaya' },
    { email: 'budi@tokomaju.com', name: 'Budi Santoso', id: 'agent-2', tenant_name: 'Toko Maju Jaya' },
    { email: 'dewi@tokomaju.com', name: 'Dewi Lestari', id: 'agent-3', tenant_name: 'Toko Maju Jaya' },
  ];

  const handleDemoLogin = (user: any) => {
    loginDemo(user);
    if (user.role === 'super_admin') navigate('/super-admin');
    else if (user.role === 'admin_agent') navigate('/admin');
    else navigate('/agent');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) return toast.error('Mohon isi email dan kata sandi');
    try {
      const success = await login(email, password);
      if (!success) return;
      const user = useAuthStore.getState().user;
      if (user?.role === 'super_admin') navigate('/super-admin');
      else if (user?.role === 'admin_agent') navigate('/admin');
      else navigate('/agent');
    } catch (error: any) {
      toast.error(error.message || 'Gagal masuk');
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-visual">
        <div className="auth-grid" />
        <div className="auth-orb auth-orb--one" /><div className="auth-orb auth-orb--two" />
        <Link to="/" className="auth-brand"><BrandLogo inverted /></Link>
        <div className="auth-visual__copy">
          <span className="auth-eyebrow"><Sparkles size={13} /> AI SERVICE OPERATING SYSTEM</span>
          <h1>Setiap chat.<br /><em>Satu langkah lebih maju.</em></h1>
          <p>Masuk ke workspace yang menyatukan WhatsApp, tim, campaign, dan AI dalam satu alur kerja yang rapi.</p>
          <div className="auth-feature-row"><span><Check size={13} /> Multi-role workspace</span><span><Check size={13} /> Realtime operation</span><span><Check size={13} /> AI-assisted service</span></div>
        </div>
        <div className="auth-preview">
          <div className="auth-preview__head"><span><MessageCircle size={15} /> Live conversation</span><i /> </div>
          <div className="auth-preview__message"><div>RA</div><p><strong>Rani Putri</strong><span>Apakah pesanan saya bisa dikirim hari ini?</span></p><small>10:42</small></div>
          <div className="auth-preview__ai"><Bot size={14} /><p><strong>AI suggestion ready</strong><span>Confidence 94.8%</span></p><ArrowRight size={14} /></div>
        </div>
        <footer>© 2026 WACentral <span>by myaicustom.com</span></footer>
      </div>

      <div className="auth-panel">
        <div className="auth-panel__inner">
          <Link to="/" className="auth-back"><ArrowLeft size={15} /> Kembali ke beranda</Link>
          <div className="auth-mobile-brand"><BrandLogo size="small" /></div>
          <div className="auth-heading"><span>SECURE ACCESS</span><h2>Selamat datang kembali.</h2><p>Masuk untuk melanjutkan operasional hari ini.</p></div>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label><span>Email kerja</span><div><Mail size={17} /><input type="email" autoComplete="email" placeholder="nama@perusahaan.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div></label>
            <label><span>Kata sandi <button type="button">Lupa kata sandi?</button></span><div><Lock size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Masukkan kata sandi" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="auth-password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            <button type="submit" className="auth-submit" disabled={authLoading}>{authLoading ? <Loader2 className="animate-spin" size={17} /> : <ShieldCheck size={17} />}<span>{authLoading ? 'Memverifikasi...' : 'Masuk ke workspace'}</span><ArrowRight size={17} /></button>
          </form>

          {showDemoAccess && (
            <div className="demo-access">
              <div className="demo-access__divider"><span>Akses demo berdasarkan role</span></div>
              <button className="demo-super" onClick={() => handleDemoLogin({ email: 'admin@localhost', role: 'super_admin', id: 'system-admin', name: 'Super Admin' })}><ShieldCheck size={15} /> System Super Admin <ArrowRight size={14} /></button>
              <button className="demo-role" onClick={() => handleDemoLogin(adminAgentUser)}><span><Users size={16} /></span><div><strong>Owner</strong><small>Toko Maju Jaya</small></div><b>Demo</b></button>
              <div className="demo-agent-group">
                <button onClick={() => setShowAgents(!showAgents)}><span><UserIcon size={16} /></span><div><strong>Staff</strong><small>3 akun tersedia</small></div>{showAgents ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                {showAgents && <div>{agents.map((agent) => <button key={agent.id} onClick={() => handleDemoLogin({ ...agent, role: 'agent' })}><span>{agent.name.slice(0, 1)}</span><p><strong>{agent.name}</strong><small>{agent.email}</small></p><ArrowRight size={13} /></button>)}</div>}
              </div>
            </div>
          )}
          <p className="auth-legal">Dengan masuk, Anda menyetujui ketentuan penggunaan dan kebijakan privasi WACentral.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
