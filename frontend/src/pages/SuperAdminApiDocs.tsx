import { useState } from 'react';
import { Copy, Terminal, ExternalLink, ShieldCheck, Zap, MessageSquare, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const SuperAdminApiDocs = () => {
  const [apiKey] = useState(import.meta.env.VITE_N8N_API_KEY || 'N8N_API_KEY_ANDA');
  const [apiUrl] = useState(import.meta.env.VITE_API_URL || window.location.origin + '/api/v1');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Disalin ke clipboard!');
  };

  const docs = [
    {
      title: 'Direct Send (API Token)',
      description: 'Kirim pesan WhatsApp langsung via API token per session (per nomor).',
      icon: <Terminal className="text-slate-500" />,
      curl: `curl -X POST "${apiUrl}/messages" \
  -H "Content-Type: application/json" \
  -H "apikey: SESSION_TOKEN" \
  -d '{ 
    "sessionId": "628123456789",
    "to": "628123456789",
    "type": "text",
    "text": { "body": "Halo! Ini pesan otomatis." }
  }'`
    },
    {
      title: 'Session Webhook (Per Nomor)',
      description: 'Simpan webhook untuk session tertentu agar pesan masuk diteruskan ke n8n.',
      icon: <Terminal className="text-indigo-500" />,
      curl: `# set webhook
curl -X POST "${apiUrl}/sessions/webhook" \
  -H "Content-Type: application/json" \
  -H "apikey: SESSION_TOKEN" \
  -d '{ "sessionId": "628123456789", "url": "https://n8n.yourdomain/webhook/xxx" }'

# get webhook
curl -X GET "${apiUrl}/sessions/webhook?sessionId=628123456789" \
  -H "apikey: SESSION_TOKEN"

# delete webhook
curl -X DELETE "${apiUrl}/sessions/webhook" \
  -H "Content-Type: application/json" \
  -H "apikey: SESSION_TOKEN" \
  -d '{ "sessionId": "628123456789" }'`
    },
    {
      title: 'Incoming Message Log',
      description: 'Gunakan ini untuk mencatat pesan yang masuk dari customer ke database CRM.',
      icon: <MessageSquare className="text-emerald-500" />,
      curl: `curl -X POST "${apiUrl}/n8n/log-message" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${apiKey}" \
  -d '{ 
    "tenant_id": 1,
    "phone_number": "628123456789",
    "message_text": "Halo, saya mau tanya...",
    "sender_type": "individual",
    "customer_name": "Budi"
  }'`
    },
    {
      title: 'Send Message (WhatsApp)',
      description: 'Kirim pesan WhatsApp langsung dari n8n melalui gateway CRM.',
      icon: <Zap className="text-amber-500" />,
      curl: `curl -X POST "${apiUrl}/n8n/send-message" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${apiKey}" \
  -d '{ 
    "tenant_id": 1,
    "phone_number": "628123456789",
    "message_text": "Ini jawaban otomatis dari AI: ..."
  }'`
    },
    {
      title: 'Escalate to Human',
      description: 'Pindahkan percakapan dari AI ke Antrian Staff Manusia.',
      icon: <AlertCircle className="text-rose-500" />,
      curl: `curl -X POST "${apiUrl}/n8n/escalate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${apiKey}" \
  -d '{ 
    "tenant_id": 1,
    "phone_number": "628123456789",
    "reason": "Customer minta bicara dengan manusia",
    "ai_summary": "Tanya soal refund tapi AI tidak paham."
  }'`
    },
    {
      title: 'Get Chat History',
      description: 'Ambil riwayat percakapan terakhir untuk memberikan konteks pada AI.',
      icon: <Terminal className="text-emerald-500" />,
      curl: `curl -X GET "${apiUrl}/n8n/conversation?tenant_id=1&phone_number=628123456789&limit=10" \
  -H "x-api-key: ${apiKey}"`
    }
  ];

  return (
    <div className="animate-in fade-in duration-500 p-6 max-w-6xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase mb-2">Integrasi API n8n</h1>
        <p className="text-gray-500 dark:text-gray-400 font-medium">Hubungkan CRM ke workflow n8n lu dengan template cURL di bawah ini.</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-3xl p-6 mb-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-emerald-500 rounded-2xl text-white">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-emerald-900 dark:text-emerald-100 uppercase tracking-tight">Security Note</h3>
              <p className="text-emerald-700/80 dark:text-emerald-300/80 text-sm mt-1 leading-relaxed">
                Endpoint <code className="bg-emerald-100 dark:bg-emerald-800 px-1.5 py-0.5 rounded font-bold">/n8n</code> pakai header <code className="bg-emerald-100 dark:bg-emerald-800 px-1.5 py-0.5 rounded font-bold">x-api-key</code> (isi dari <code className="bg-emerald-100 dark:bg-emerald-800 px-1.5 py-0.5 rounded font-bold">N8N_API_KEY</code>).
                Untuk <code className="bg-emerald-100 dark:bg-emerald-800 px-1.5 py-0.5 rounded font-bold">/messages</code> dan <code className="bg-emerald-100 dark:bg-emerald-800 px-1.5 py-0.5 rounded font-bold">/sessions/webhook</code> gunakan header <code className="bg-emerald-100 dark:bg-emerald-800 px-1.5 py-0.5 rounded font-bold">apikey</code> (token per session, bisa diambil di menu Tenant).
              </p>
            </div>
          </div>
        </div>

        {docs.map((doc, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-800 rounded-[2rem] border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden transition-all hover:shadow-md">
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-slate-900 flex items-center justify-center border border-gray-100 dark:border-slate-700 shadow-inner">
                  {doc.icon}
                </div>
                <div>
                  <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{doc.title}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{doc.description}</p>
                </div>
              </div>

              <div className="relative group">
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => copyToClipboard(doc.curl)}
                    className="p-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                  >
                    <Copy size={14} />
                    Copy
                  </button>
                </div>
                <pre className="bg-slate-900 text-slate-300 p-6 rounded-2xl overflow-x-auto font-mono text-sm leading-relaxed border-4 border-slate-800 shadow-inner">
                  {doc.curl}
                </pre>
              </div>
            </div>
          </div>
        ))}

        <div className="text-center py-10">
          <p className="text-gray-400 dark:text-gray-500 text-sm font-medium mb-4">Butuh bantuan lebih lanjut?</p>
          <a 
            href="https://n8n.io" 
            target="_blank" 
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-widest text-xs hover:underline"
          >
            Pelajari n8n documentation
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminApiDocs;
