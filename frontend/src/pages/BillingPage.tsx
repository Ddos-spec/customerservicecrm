import { useState } from 'react';
import { ArrowRight, CheckCircle2, Copy, CreditCard, ReceiptText, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const BANK_ACCOUNT = '6090125182';
const BANK_NAME = 'BCA';
const ACCOUNT_HOLDER = 'HERI ASARI';

const confirmationTemplate = `Halo admin, saya ingin konfirmasi pembayaran langganan.

Bank tujuan: ${BANK_NAME}
No rekening: ${BANK_ACCOUNT}
Atas nama: ${ACCOUNT_HOLDER}
Nama / Perusahaan:
Paket:
Nominal transfer:
Tanggal transfer:

Saya akan kirim bukti transfer setelah ini.`;

const copyToClipboard = async (text: string, successMessage: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch (error) {
    console.error('Failed to copy billing text:', error);
    toast.error('Gagal copy, coba salin manual ya');
  }
};

const BillingPage = () => {
  const [selectedPlan, setSelectedPlan] = useState('Bulanan');

  const paymentDetail = `${BANK_NAME} ${BANK_ACCOUNT} a/n ${ACCOUNT_HOLDER}`;
  const plans = ['Bulanan', '3 Bulan', 'Tahunan'];

  return (
    <div className="min-h-[calc(100vh-7rem)] overflow-hidden rounded-[2rem] border border-emerald-100 dark:border-emerald-900 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_34%),linear-gradient(135deg,_#f7fee7_0%,_#f8fafc_48%,_#ecfeff_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.22),_transparent_34%),linear-gradient(135deg,_#020617_0%,_#0f172a_55%,_#022c22_100%)] p-4 sm:p-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="space-y-6 py-4 sm:py-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-slate-950/60 dark:text-emerald-300">
            <ShieldCheck size={15} />
            Transfer Manual Aman
          </div>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
              Langganan CRM jadi gampang, bayar via BCA.
            </h1>
            <p className="max-w-2xl text-base font-medium leading-8 text-slate-600 dark:text-slate-300">
              Pilih periode langganan, transfer ke rekening resmi, lalu kirim bukti transfer ke admin untuk aktivasi atau perpanjangan akun.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {plans.map((plan) => (
              <button
                key={plan}
                type="button"
                onClick={() => setSelectedPlan(plan)}
                className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                  selectedPlan === plan
                    ? 'border-emerald-500 bg-emerald-600 text-white shadow-xl shadow-emerald-500/20'
                    : 'border-white/80 bg-white/75 text-slate-700 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">Paket</p>
                <p className="mt-1 text-lg font-black">{plan}</p>
                <p className="mt-2 text-xs font-semibold opacity-80">Nominal mengikuti invoice admin.</p>
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {['Transfer ke rekening BCA', 'Kirim bukti pembayaran', 'Akun diproses admin'].map((step, index) => (
              <div key={step} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-sm font-black text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                  {index + 1}
                </div>
                <p className="text-sm font-black text-slate-900 dark:text-white">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="relative">
          <div className="absolute -inset-4 rounded-[2.5rem] bg-emerald-400/20 blur-3xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-2xl shadow-emerald-900/10 backdrop-blur dark:border-slate-700 dark:bg-slate-950/85">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-300">Tujuan Pembayaran</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Rekening BCA</h2>
              </div>
              <div className="rounded-2xl bg-emerald-600 p-3 text-white shadow-lg shadow-emerald-600/25">
                <CreditCard size={24} />
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Bank</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{BANK_NAME}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Nomor Rekening</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="font-mono text-3xl font-black tracking-tight text-slate-950 dark:text-white">{BANK_ACCOUNT}</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(BANK_ACCOUNT, 'Nomor rekening berhasil dicopy')}
                    className="rounded-xl bg-white p-3 text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50 dark:bg-slate-800 dark:text-emerald-300 dark:hover:bg-slate-700"
                    aria-label="Copy nomor rekening"
                  >
                    <Copy size={18} />
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Atas Nama</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{ACCOUNT_HOLDER}</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Pastikan nama penerima tertulis <span className="font-black">{ACCOUNT_HOLDER}</span> sebelum transfer.
            </div>

            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={() => copyToClipboard(paymentDetail, 'Detail rekening berhasil dicopy')}
                className="flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black uppercase tracking-widest text-white transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
              >
                <Copy size={18} />
                Copy Detail Rekening
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(confirmationTemplate.replace('Paket:', `Paket: ${selectedPlan}`), 'Template konfirmasi berhasil dicopy')}
                className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black uppercase tracking-widest text-emerald-700 transition-transform hover:-translate-y-0.5 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              >
                <ReceiptText size={18} />
                Copy Format Konfirmasi
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {[
                'Transfer sesuai nominal tagihan atau invoice admin.',
                'Simpan bukti transfer untuk proses validasi.',
                'Aktivasi dilakukan setelah pembayaran terkonfirmasi.'
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={18} />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between rounded-2xl bg-emerald-600 px-5 py-4 text-white">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">Pilihan Saat Ini</p>
                <p className="text-lg font-black">{selectedPlan}</p>
              </div>
              <ArrowRight size={22} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default BillingPage;
