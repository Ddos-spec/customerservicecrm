import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const InviteAccept = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchInvite = async () => {
      if (!token) return;
      setIsLoading(true);
      try {
        const res = await api.get(`/admin/invites/${token}`);
        if (res.data.success) {
          setInvite(res.data.invite);
        }
      } catch (error: any) {
        toast.error(error.response?.data?.error || 'Undangan tidak ditemukan');
      } finally {
        setIsLoading(false);
      }
    };
    void fetchInvite();
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!password || password.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Konfirmasi password tidak cocok');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post(`/admin/invites/${token}/accept`, {
        password,
        phone_number: phoneNumber.trim() || undefined
      });
      if (res.data.success) {
        toast.success('Akun berhasil diaktifkan');
        navigate('/login');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal aktivasi akun');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 px-6 py-12">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-lg w-full p-10 border border-gray-100 dark:border-slate-700">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Aktivasi Akun Staff</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Selesaikan aktivasi agar bisa login.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <Loader2 className="animate-spin mb-3" size={24} />
            Memuat undangan...
          </div>
        ) : invite ? (
          <form onSubmit={handleAccept} className="space-y-4">
            <div className="bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-2xl p-4 space-y-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">Nama</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">{invite.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Email</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">{invite.email}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Tenant</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">{invite.tenant_name || '-'}</div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Password Baru</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400"
                placeholder="Minimal 6 karakter"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Konfirmasi Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-4 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400"
                placeholder="Ulangi password"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">No. WhatsApp (opsional)</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full p-4 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400"
                placeholder="62xxxxxxxxxx"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center space-x-2"
            >
              {isSubmitting && <Loader2 className="animate-spin" size={16} />}
              <span>{isSubmitting ? 'Memproses...' : 'Aktifkan Akun'}</span>
            </button>
          </form>
        ) : (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <X size={32} className="mx-auto mb-3" />
            Undangan tidak valid atau sudah kadaluarsa.
          </div>
        )}
      </div>
    </div>
  );
};

export default InviteAccept;
