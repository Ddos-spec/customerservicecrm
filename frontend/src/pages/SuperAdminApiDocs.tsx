import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  KeyRound,
  MessageSquare,
  ShieldCheck,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

type HttpMethod = 'GET' | 'POST';

interface FieldDoc {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

interface EndpointDoc {
  id: string;
  title: string;
  category: string;
  method: HttpMethod;
  path: string;
  description: string;
  when: string;
  icon: ReactNode;
  fields?: FieldDoc[];
  query?: FieldDoc[];
  sampleBody?: Record<string, unknown>;
  sampleQuery?: Record<string, string | number | boolean>;
  responseNotes: string[];
}

const normalizeBaseUrl = () => {
  const raw = import.meta.env.VITE_API_URL || `${window.location.origin}/api/v1`;
  return raw.replace(/\/+$/, '');
};

const jsonBlock = (value: unknown) => JSON.stringify(value, null, 2);

const toQueryString = (query?: Record<string, string | number | boolean>) => {
  if (!query) return '';
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => params.set(key, String(value)));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};

const buildCurl = (apiUrl: string, doc: EndpointDoc) => {
  const url = `${apiUrl}${doc.path}${doc.method === 'GET' ? toQueryString(doc.sampleQuery) : ''}`;
  const lines = [
    `curl -X ${doc.method} "${url}" \\`,
    '  -H "X-Tenant-Key: TENANT_API_KEY"',
  ];

  if (doc.method === 'POST') {
    lines.push('  -H "Content-Type: application/json" \\');
    lines.push(`  -d '${jsonBlock(doc.sampleBody || {})}'`);
  }

  return lines.join('\n');
};

const buildEndpointDocs = (): EndpointDoc[] => [
  {
    id: 'direct-send',
    title: 'Direct Send Text',
    category: 'Quick Send',
    method: 'POST',
    path: '/messages/external',
    description: 'Endpoint paling simpel untuk mengirim teks WhatsApp memakai Tenant API Key.',
    when: 'Pakai untuk integrasi ringan, bot eksternal, form website, atau automasi yang hanya butuh kirim pesan teks.',
    icon: <Terminal className="text-blue-500" />,
    fields: [
      { name: 'phone', type: 'string', required: true, description: 'Nomor tujuan. Format aman: 628xxxxxxxx atau +628xxxxxxxx.' },
      { name: 'message', type: 'string', required: true, description: 'Isi pesan teks yang akan dikirim.' },
      { name: 'to', type: 'string', description: 'Alias untuk phone.' },
      { name: 'text', type: 'string', description: 'Alias untuk message.' },
    ],
    sampleBody: {
      phone: '628123456789',
      message: 'Halo Budi, pesanan kamu sudah kami terima. Ada yang bisa kami bantu lagi?',
    },
    responseNotes: [
      '200 success berarti pesan dikirim/disimpan sesuai provider.',
      '202 queued berarti gateway belum siap, tetapi pesan sudah masuk outbound queue.',
      'Endpoint ini hanya untuk teks; media gunakan endpoint Gateway Media.',
    ],
  },
  {
    id: 'log-message',
    title: 'Log Message',
    category: 'Conversation Memory',
    method: 'POST',
    path: '/gateway/log-message',
    description: 'Mencatat pesan masuk/keluar ke CRM tanpa mengirim pesan WhatsApp.',
    when: 'Pakai saat AI/agent eksternal menerima pesan dari sumber lain dan ingin menyimpan konteks chat di CRM.',
    icon: <MessageSquare className="text-emerald-500" />,
    fields: [
      { name: 'phone_number', type: 'string', required: true, description: 'Nomor customer.' },
      { name: 'message_text', type: 'string', required: true, description: 'Isi pesan yang dicatat.' },
      { name: 'sender_type', type: 'customer | agent | system | me', required: true, description: 'Pemilik pesan. me akan dinormalisasi menjadi agent.' },
      { name: 'customer_name', type: 'string', description: 'Nama customer bila tersedia.' },
    ],
    sampleBody: {
      phone_number: '628123456789',
      message_text: 'Halo, saya mau tanya status pesanan.',
      sender_type: 'customer',
      customer_name: 'Budi',
    },
    responseNotes: ['Mengembalikan message_id, tenant_id, chat_id, dan chat_status.'],
  },
  {
    id: 'bulk-log',
    title: 'Bulk Log Messages',
    category: 'Conversation Memory',
    method: 'POST',
    path: '/gateway/log-message-bulk',
    description: 'Mencatat banyak pesan sekaligus untuk import/backfill riwayat chat.',
    when: 'Pakai untuk migrasi data, sinkronisasi batch, atau menambahkan beberapa pesan historis dalam satu request.',
    icon: <FileText className="text-cyan-500" />,
    fields: [
      { name: 'messages', type: 'array', required: true, description: 'Array item berisi phone_number, message_text, sender_type, customer_name opsional.' },
    ],
    sampleBody: {
      messages: [
        {
          phone_number: '628123456789',
          message_text: 'Halo, saya butuh info produk.',
          sender_type: 'customer',
          customer_name: 'Budi',
        },
        {
          phone_number: '628123456789',
          message_text: 'Siap, kami bantu cek produknya.',
          sender_type: 'agent',
        },
      ],
    },
    responseNotes: ['Response berisi results per pesan; item bisa success atau error tanpa menggagalkan seluruh batch.'],
  },
  {
    id: 'gateway-send-text',
    title: 'Gateway Send Text',
    category: 'WhatsApp Send',
    method: 'POST',
    path: '/gateway/send-message',
    description: 'Kirim teks via WhatsApp Gateway dan otomatis log ke conversation CRM.',
    when: 'Pakai untuk AI assistant utama karena endpoint ini tenant-aware, masuk queue, dan tersambung ke riwayat CRM.',
    icon: <Zap className="text-amber-500" />,
    fields: [
      { name: 'phone_number', type: 'string', required: true, description: 'Nomor customer atau JID tujuan.' },
      { name: 'message_text', type: 'string', required: true, description: 'Isi pesan balasan.' },
      { name: 'mentions', type: 'string[]', description: 'Nomor yang akan dimention bila mengirim ke grup.' },
    ],
    sampleBody: {
      phone_number: '628123456789',
      message_text: 'Ini jawaban otomatis dari AI. Jika mau bicara dengan staff, balas: admin.',
      mentions: [],
    },
    responseNotes: ['Mengembalikan message_id, tenant_id, chat_id, dan gateway_response.'],
  },
  {
    id: 'send-image',
    title: 'Send Image',
    category: 'WhatsApp Media',
    method: 'POST',
    path: '/gateway/send-image',
    description: 'Mengirim gambar WhatsApp dari URL publik dan mencatatnya sebagai media message.',
    when: 'Pakai untuk katalog, bukti transfer, invoice screenshot, atau materi promo visual.',
    icon: <ImageIcon className="text-sky-500" />,
    fields: [
      { name: 'phone_number', type: 'string', required: true, description: 'Nomor customer.' },
      { name: 'image_url', type: 'string', required: true, description: 'URL gambar yang bisa diakses backend/gateway.' },
      { name: 'caption', type: 'string', description: 'Caption opsional.' },
      { name: 'view_once', type: 'boolean', description: 'Kirim sebagai view once bila true.' },
    ],
    sampleBody: {
      phone_number: '628123456789',
      image_url: 'https://example.com/katalog.jpg',
      caption: 'Ini katalog terbaru ya.',
      view_once: false,
    },
    responseNotes: ['URL media harus reachable dari server. Gunakan HTTPS publik untuk hasil paling stabil.'],
  },
  {
    id: 'send-document',
    title: 'Send Document',
    category: 'WhatsApp Media',
    method: 'POST',
    path: '/gateway/send-document',
    description: 'Mengirim file dokumen via WhatsApp dan menyimpan jejaknya di CRM.',
    when: 'Pakai untuk PDF invoice, surat jalan, quotation, atau dokumen teknis.',
    icon: <FileText className="text-violet-500" />,
    fields: [
      { name: 'phone_number', type: 'string', required: true, description: 'Nomor customer.' },
      { name: 'document_url', type: 'string', required: true, description: 'URL file dokumen. Alias: document, file_url, media_url.' },
      { name: 'filename', type: 'string', description: 'Nama file yang tampil di WhatsApp.' },
      { name: 'caption', type: 'string', description: 'Caption opsional.' },
    ],
    sampleBody: {
      phone_number: '628123456789',
      document_url: 'https://example.com/invoice-INV-001.pdf',
      filename: 'invoice-INV-001.pdf',
      caption: 'Invoice pesanan kamu kami lampirkan.',
    },
    responseNotes: ['Gunakan filename jelas agar customer mudah mengenali dokumen.'],
  },
  {
    id: 'send-video',
    title: 'Send Video',
    category: 'WhatsApp Media',
    method: 'POST',
    path: '/gateway/send-video',
    description: 'Mengirim video dari URL publik ke WhatsApp.',
    when: 'Pakai untuk video demo produk, tutorial, atau bukti proses pengerjaan.',
    icon: <Workflow className="text-rose-500" />,
    fields: [
      { name: 'phone_number', type: 'string', required: true, description: 'Nomor customer.' },
      { name: 'video_url', type: 'string', required: true, description: 'URL video. Alias: video atau media_url.' },
      { name: 'caption', type: 'string', description: 'Caption opsional.' },
      { name: 'view_once', type: 'boolean', description: 'Kirim sebagai view once bila true.' },
    ],
    sampleBody: {
      phone_number: '628123456789',
      video_url: 'https://example.com/demo-produk.mp4',
      caption: 'Ini video demo produknya.',
      view_once: false,
    },
    responseNotes: ['Pastikan ukuran dan format video aman untuk WhatsApp.'],
  },
  {
    id: 'send-audio',
    title: 'Send Audio',
    category: 'WhatsApp Media',
    method: 'POST',
    path: '/gateway/send-audio',
    description: 'Mengirim audio dari URL publik ke WhatsApp.',
    when: 'Pakai untuk voice note otomatis, instruksi audio, atau follow-up human-like.',
    icon: <MessageSquare className="text-fuchsia-500" />,
    fields: [
      { name: 'phone_number', type: 'string', required: true, description: 'Nomor customer.' },
      { name: 'audio_url', type: 'string', required: true, description: 'URL audio. Alias: audio atau media_url.' },
    ],
    sampleBody: {
      phone_number: '628123456789',
      audio_url: 'https://example.com/pesan-suara.mp3',
    },
    responseNotes: ['Gunakan URL audio publik dan format yang didukung gateway.'],
  },
  {
    id: 'conversation',
    title: 'Get Conversation',
    category: 'AI Context',
    method: 'GET',
    path: '/gateway/conversation',
    description: 'Mengambil riwayat chat terakhir untuk konteks AI sebelum membalas.',
    when: 'Pakai sebelum membuat jawaban AI agar model memahami percakapan sebelumnya.',
    icon: <BookOpen className="text-emerald-500" />,
    query: [
      { name: 'phone_number', type: 'string', required: true, description: 'Nomor customer.' },
      { name: 'limit', type: 'number', description: 'Jumlah pesan terakhir. Default backend 50.' },
    ],
    sampleQuery: { phone_number: '628123456789', limit: 20 },
    responseNotes: ['Jika chat belum ada, response success dengan chat null dan messages array kosong.'],
  },
  {
    id: 'check-escalation',
    title: 'Check Escalation',
    category: 'Human Handoff',
    method: 'GET',
    path: '/gateway/check-escalation',
    description: 'Mengecek apakah pesan customer mengandung sinyal perlu ditangani manusia.',
    when: 'Pakai sebelum AI menjawab ketika ada kata refund, komplain, marah, cancel, atau minta admin.',
    icon: <AlertCircle className="text-orange-500" />,
    query: [
      { name: 'message', type: 'string', required: true, description: 'Pesan customer yang ingin dicek.' },
    ],
    sampleQuery: { message: 'Saya mau refund dan bicara dengan admin' },
    responseNotes: ['Mengembalikan needs_escalation, reason, dan matched_keyword bila terdeteksi.'],
  },
  {
    id: 'escalate',
    title: 'Escalate To Human',
    category: 'Human Handoff',
    method: 'POST',
    path: '/gateway/escalate',
    description: 'Memindahkan chat ke status escalated agar staff manusia mengambil alih.',
    when: 'Pakai jika customer minta admin/staff, komplain berat, refund, cancel, atau AI tidak yakin.',
    icon: <ShieldCheck className="text-rose-500" />,
    fields: [
      { name: 'phone_number', type: 'string', required: true, description: 'Nomor customer.' },
      { name: 'reason', type: 'string', description: 'Alasan eskalasi.' },
      { name: 'ai_summary', type: 'string', description: 'Ringkasan singkat untuk staff manusia.' },
    ],
    sampleBody: {
      phone_number: '628123456789',
      reason: 'Customer minta bicara dengan admin soal refund.',
      ai_summary: 'Customer tanya refund order INV-001 dan sudah dua kali follow-up.',
    },
    responseNotes: ['Chat harus aktif. Jika chat tidak ditemukan atau closed, API mengembalikan error.'],
  },
  {
    id: 'escalation-queue',
    title: 'Escalation Queue',
    category: 'Human Handoff',
    method: 'GET',
    path: '/gateway/escalation-queue',
    description: 'Mengambil daftar chat yang sedang menunggu staff manusia.',
    when: 'Pakai untuk dashboard operator, monitoring AI handoff, atau sistem notifikasi staff.',
    icon: <Workflow className="text-indigo-500" />,
    query: [
      { name: 'limit', type: 'number', description: 'Jumlah chat maksimal. Default 20.' },
    ],
    sampleQuery: { limit: 20 },
    responseNotes: ['Response berisi chats, count, dan tenant_id.'],
  },
  {
    id: 'close-chat',
    title: 'Close Chat',
    category: 'Lifecycle',
    method: 'POST',
    path: '/gateway/close-chat',
    description: 'Menutup chat saat percakapan selesai.',
    when: 'Pakai setelah masalah customer selesai atau setelah AI/staff mengakhiri ticket.',
    icon: <CheckCircle2 className="text-emerald-500" />,
    fields: [
      { name: 'phone_number', type: 'string', description: 'Nomor customer. Wajib bila chat_id tidak dipakai.' },
      { name: 'chat_id', type: 'string', description: 'ID chat. Wajib bila phone_number tidak dipakai.' },
    ],
    sampleBody: {
      phone_number: '628123456789',
    },
    responseNotes: ['Mengembalikan chat_id dan status closed.'],
  },
];

const buildLlmMarkdown = (apiUrl: string, endpointDocs: EndpointDoc[]) => {
  const lines: string[] = [
    '# Customer Service WhatsApp API - LLM Usage Guide',
    '',
    `Base URL: ${apiUrl}`,
    '',
    '## Purpose',
    'Dokumen ini dibuat agar AI agent/LLM dapat memahami cara memakai API Customer Service WhatsApp CRM untuk membaca konteks chat, mengirim pesan, mengirim media, eskalasi ke manusia, dan menutup percakapan.',
    '',
    '## Authentication',
    '- Semua endpoint di bawah memakai header: `X-Tenant-Key: TENANT_API_KEY`.',
    '- Jangan expose Tenant API Key ke browser publik, prompt customer, atau response AI.',
    '- Endpoint gateway juga dapat menerima key sistem melalui `X-API-Key`, tetapi untuk integrasi tenant gunakan `X-Tenant-Key`.',
    '',
    '## Phone and JID Rules',
    '- Format nomor paling aman: `628123456789` atau `+628123456789`.',
    '- Jangan gunakan spasi, tanda kurung, atau strip jika bisa dihindari.',
    '- Untuk grup, beberapa endpoint bisa menerima JID WhatsApp, tetapi campaign marketing sengaja memakai kontak pribadi saja.',
    '',
    '## Recommended AI Flow',
    '1. Saat ada pesan customer, ambil konteks dengan `GET /gateway/conversation`.',
    '2. Cek kebutuhan human handoff dengan `GET /gateway/check-escalation`.',
    '3. Jika aman dijawab AI, kirim balasan via `POST /gateway/send-message`.',
    '4. Jika butuh manusia, panggil `POST /gateway/escalate` dengan alasan dan ringkasan.',
    '5. Jika percakapan selesai, panggil `POST /gateway/close-chat`.',
    '',
    '## Response Rules for AI Agents',
    '- Treat HTTP 200 `success: true` as success.',
    '- Treat HTTP 202 `status: queued` as success queued; do not retry aggressively.',
    '- On 401, Tenant API Key hilang/salah.',
    '- On 400, body/query kurang valid.',
    '- On 503, gateway/provider belum siap; boleh retry dengan backoff.',
    '- Media URL wajib bisa diakses server/gateway.',
    '',
    '## JavaScript Helper',
    '```js',
    `const API_BASE = '${apiUrl}';`,
    "const TENANT_KEY = process.env.TENANT_API_KEY;",
    '',
    'async function crmRequest(path, options = {}) {',
    '  const response = await fetch(API_BASE + path, {',
    '    ...options,',
    '    headers: {',
    "      'X-Tenant-Key': TENANT_KEY,",
    "      'Content-Type': 'application/json',",
    '      ...(options.headers || {}),',
    '    },',
    '  });',
    '  const data = await response.json().catch(() => ({}));',
    '  if (!response.ok && response.status !== 202) {',
    "    throw new Error(data.message || data.error || 'CRM API request failed');",
    '  }',
    '  return data;',
    '}',
    '',
    'async function getConversation(phone) {',
    "  return crmRequest('/gateway/conversation?phone_number=' + encodeURIComponent(phone) + '&limit=20');",
    '}',
    '',
    'async function sendAiReply(phone, text) {',
    "  return crmRequest('/gateway/send-message', {",
    "    method: 'POST',",
    '    body: JSON.stringify({ phone_number: phone, message_text: text }),',
    '  });',
    '}',
    '```',
    '',
    '## Endpoint Reference',
  ];

  endpointDocs.forEach((doc) => {
    lines.push('');
    lines.push(`### ${doc.method} ${doc.path} - ${doc.title}`);
    lines.push(`Category: ${doc.category}`);
    lines.push('');
    lines.push(doc.description);
    lines.push('');
    lines.push(`When to use: ${doc.when}`);

    const fieldDocs = doc.method === 'GET' ? doc.query : doc.fields;
    if (fieldDocs?.length) {
      lines.push('');
      lines.push('| Field | Type | Required | Description |');
      lines.push('| --- | --- | --- | --- |');
      fieldDocs.forEach((field) => {
        lines.push(`| ${field.name} | ${field.type} | ${field.required ? 'yes' : 'no'} | ${field.description} |`);
      });
    }

    if (doc.method === 'POST') {
      lines.push('');
      lines.push('Sample body:');
      lines.push('```json');
      lines.push(jsonBlock(doc.sampleBody || {}));
      lines.push('```');
    }

    lines.push('');
    lines.push('cURL:');
    lines.push('```bash');
    lines.push(buildCurl(apiUrl, doc));
    lines.push('```');
    lines.push('');
    lines.push('Response notes:');
    doc.responseNotes.forEach((note) => lines.push(`- ${note}`));
  });

  return `${lines.join('\n')}\n`;
};

const SuperAdminApiDocs = () => {
  const [apiUrl] = useState(normalizeBaseUrl);
  const endpointDocs = useMemo(() => buildEndpointDocs(), []);
  const llmMarkdown = useMemo(() => buildLlmMarkdown(apiUrl, endpointDocs), [apiUrl, endpointDocs]);

  const copyToClipboard = async (text: string, message = 'Disalin ke clipboard') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    toast.success(message);
  };

  const downloadMarkdown = () => {
    const blob = new Blob([llmMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'customer-service-wa-api-llm.md';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success('File dokumentasi LLM berhasil dibuat');
  };

  return (
    <div className="crm-page animate-in fade-in duration-500">
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/10 dark:border-white/10 md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.28),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(59,130,246,0.26),_transparent_36%)]" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-200">
              <Code2 size={14} />
              Customer Service WhatsApp API
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-5xl">API Documentation Hub</h1>
            <p className="mt-4 text-sm leading-7 text-slate-300 md:text-base">
              Dokumentasi operasional untuk AI agent, automasi, dan sistem eksternal: baca konteks chat, kirim teks/media,
              eskalasi ke staff, sampai tutup percakapan. Semua contoh sudah memakai endpoint resmi project ini.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <button
              onClick={() => copyToClipboard(llmMarkdown, 'Markdown full API docs siap ditempel ke LLM')}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 active:scale-[0.98]"
            >
              <Copy size={17} />
              Copy to LLM
            </button>
            <button
              onClick={downloadMarkdown}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white backdrop-blur transition-all hover:bg-white/15 active:scale-[0.98]"
            >
              <Download size={17} />
              Install .md File
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: <KeyRound className="text-emerald-500" />,
            title: 'Auth wajib',
            body: 'Gunakan X-Tenant-Key. Tidak perlu mengirim tenant_id untuk endpoint tenant-scoped.',
          },
          {
            icon: <Workflow className="text-blue-500" />,
            title: 'Flow AI ideal',
            body: 'conversation → check escalation → send reply atau escalate → close chat.',
          },
          {
            icon: <ShieldCheck className="text-amber-500" />,
            title: 'Queue safe',
            body: 'Jika gateway belum siap, response 202 queued tetap dianggap sukses tersimpan.',
          },
        ].map((item) => (
          <div key={item.title} className="crm-surface">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
              {item.icon}
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="space-y-5">
          {endpointDocs.map((doc) => {
            const curl = buildCurl(apiUrl, doc);
            const fieldDocs = doc.method === 'GET' ? doc.query : doc.fields;

            return (
              <section key={doc.id} className="crm-surface overflow-hidden p-0">
                <div className="border-b border-slate-100 p-5 dark:border-slate-800 md:p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
                        {doc.icon}
                      </div>
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${doc.method === 'POST' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                            {doc.method}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {doc.category}
                          </span>
                        </div>
                        <h2 className="text-xl font-black text-slate-950 dark:text-white">{doc.title}</h2>
                        <p className="mt-1 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">{doc.path}</p>
                        <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{doc.description}</p>
                        <p className="mt-2 text-xs leading-5 text-slate-400 dark:text-slate-500">
                          <strong className="text-slate-600 dark:text-slate-300">Kapan dipakai:</strong> {doc.when}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(curl, `${doc.title} cURL disalin`)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Copy size={14} />
                      Copy cURL
                    </button>
                  </div>
                </div>

                <div className="grid gap-0 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
                  <div className="border-b border-slate-100 p-5 dark:border-slate-800 lg:border-b-0 lg:border-r md:p-6">
                    <h3 className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Fields</h3>
                    <div className="space-y-3">
                      {fieldDocs?.map((field) => (
                        <div key={field.name} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100 dark:bg-slate-900/70 dark:ring-slate-800">
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="font-mono text-sm font-black text-slate-900 dark:text-white">{field.name}</code>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-slate-700">{field.type}</span>
                            {field.required && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase text-rose-600 dark:bg-rose-900/30 dark:text-rose-300">required</span>}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{field.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="p-5 md:p-6">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Example</h3>
                      <button
                        onClick={() => copyToClipboard(curl, `${doc.title} cURL disalin`)}
                        className="text-xs font-black text-emerald-600 hover:text-emerald-500"
                      >
                        Copy
                      </button>
                    </div>
                    <pre
                      role="button"
                      tabIndex={0}
                      title="Klik untuk copy cURL"
                      onClick={() => copyToClipboard(curl, `${doc.title} cURL disalin`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          void copyToClipboard(curl, `${doc.title} cURL disalin`);
                        }
                      }}
                      className="max-h-[360px] cursor-pointer overflow-x-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-300 ring-1 ring-slate-800 transition-all hover:ring-emerald-500/50"
                    >
                      {curl}
                    </pre>
                    <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-xs leading-6 text-emerald-800 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900/40">
                      <p className="mb-1 font-black uppercase tracking-[0.14em]">Response notes</p>
                      <ul className="list-disc space-y-1 pl-4">
                        {doc.responseNotes.map((note) => <li key={note}>{note}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <aside className="crm-surface sticky top-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800">
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="font-black text-slate-900 dark:text-white">LLM Markdown Pack</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">File siap dibaca AI agent.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Base URL</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-800">{apiUrl}</code>
              <button onClick={() => copyToClipboard(apiUrl, 'Base URL disalin')} className="rounded-xl bg-slate-900 p-2 text-white transition-all hover:bg-slate-700 active:scale-[0.96] dark:bg-white dark:text-slate-900">
                <Copy size={15} />
              </button>
            </div>
          </div>

          <button
            onClick={() => copyToClipboard(llmMarkdown, 'Markdown full API docs siap ditempel ke LLM')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition-all hover:bg-emerald-500 active:scale-[0.98]"
          >
            <Copy size={17} />
            Copy Full Markdown
          </button>
          <button
            onClick={downloadMarkdown}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download size={17} />
            Install / Download File
          </button>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Preview</p>
              <a
                href="https://developer.mozilla.org/en-US/docs/Web/HTTP"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 transition-colors hover:text-emerald-500"
              >
                HTTP Ref <ExternalLink size={12} />
              </a>
            </div>
            <pre className="max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 font-mono text-[11px] leading-5 text-slate-300 ring-1 ring-slate-800">
              {llmMarkdown.slice(0, 2800)}
              {'\n...\n'}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default SuperAdminApiDocs;
