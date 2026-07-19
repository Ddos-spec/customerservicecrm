import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Bot, Check, ChevronRight, Clock3, Headphones,
  Menu, MessageCircle, Play, ShieldCheck, Sparkles, Users, X, Zap
} from 'lucide-react';

const capabilities = [
  'Unified WhatsApp Inbox',
  'AI Response Assistant',
  'Campaign & Broadcast',
  'Realtime Performance',
  'Multi-tenant Control',
];

const roleCards = [
  {
    number: '01',
    title: 'Super Admin',
    eyebrow: 'System control',
    copy: 'Pantau tenant, sesi gateway, pengguna, dan kesehatan seluruh operasi dari satu command center.',
    items: ['Tenant orchestration', 'Global session health', 'API & security control'],
  },
  {
    number: '02',
    title: 'Owner',
    eyebrow: 'Business clarity',
    copy: 'Lihat kualitas layanan, kelola staf, otomasi AI, campaign, billing, dan integrasi tanpa berpindah alat.',
    items: ['Live business metrics', 'Team & AI management', 'Marketing operations'],
  },
  {
    number: '03',
    title: 'Staff',
    eyebrow: 'Faster resolution',
    copy: 'Workspace fokus untuk membalas percakapan, melihat konteks pelanggan, dan menuntaskan antrean lebih cepat.',
    items: ['Focused shared inbox', 'Customer context', 'Personal performance'],
  },
];

const messages = [
  { name: 'Rani Putri', text: 'Apakah pesanan saya bisa dikirim hari ini?', time: '10:42', active: true },
  { name: 'Aldo Wijaya', text: 'Terima kasih, paketnya sudah sampai.', time: '10:38' },
  { name: 'Nadia Akbar', text: 'Boleh minta katalog terbaru?', time: '10:31' },
];

const LandingPage = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-shell">
      <header className={`landing-nav ${scrolled ? 'landing-nav--scrolled' : ''}`}>
        <div className="landing-container landing-nav__inner">
          <Link to="/" className="landing-brand" aria-label="WACentral homepage">
            <span className="brand-mark"><span>W</span></span>
            <span className="landing-brand__text">WA<span>Central</span></span>
          </Link>

          <nav className="landing-nav__links" aria-label="Navigasi utama">
            <a href="#platform">Platform</a>
            <a href="#roles">Untuk Tim</a>
            <a href="#workflow">Cara Kerja</a>
            <a href="#results">Hasil</a>
          </nav>

          <div className="landing-nav__actions">
            <Link to="/login" className="landing-link">Masuk</Link>
            <Link to="/subscribe" className="landing-button landing-button--small">
              Mulai sekarang <ArrowRight size={15} />
            </Link>
          </div>

          <button className="landing-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Buka menu">
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {menuOpen && (
          <div className="landing-mobile-menu">
            <a href="#platform" onClick={closeMenu}>Platform <ChevronRight size={18} /></a>
            <a href="#roles" onClick={closeMenu}>Untuk Tim <ChevronRight size={18} /></a>
            <a href="#workflow" onClick={closeMenu}>Cara Kerja <ChevronRight size={18} /></a>
            <a href="#results" onClick={closeMenu}>Hasil <ChevronRight size={18} /></a>
            <Link to="/login" onClick={closeMenu}>Masuk <ArrowRight size={18} /></Link>
          </div>
        )}
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero__glow landing-hero__glow--one" />
          <div className="landing-hero__glow landing-hero__glow--two" />
          <div className="landing-grid landing-grid--hero" aria-hidden="true" />
          <div className="landing-container landing-hero__content">
            <div className="landing-hero__copy">
              <div className="landing-kicker reveal-up">
                <span><Sparkles size={13} /></span>
                AI customer service operating system
              </div>
              <h1 className="reveal-up reveal-delay-1">
                Satu inbox.<br />
                <span>Setiap percakapan</span><br />
                bergerak maju.
              </h1>
              <p className="reveal-up reveal-delay-2">
                Satukan WhatsApp, tim customer service, campaign, dan AI dalam workspace yang membuat respons lebih cepat dan keputusan lebih tajam.
              </p>
              <div className="landing-hero__actions reveal-up reveal-delay-3">
                <Link to="/subscribe" className="landing-button">
                  Mulai operasional <ArrowRight size={18} />
                </Link>
                <a href="#platform" className="landing-button landing-button--ghost">
                  <span className="landing-play"><Play size={13} fill="currentColor" /></span>
                  Lihat platform
                </a>
              </div>
              <div className="landing-proof reveal-up reveal-delay-4">
                <div className="landing-avatars" aria-hidden="true">
                  <span>RA</span><span>BP</span><span>SA</span><span>+</span>
                </div>
                <p><strong>Built for Indonesia</strong><br />Operasional CS dari 1 hingga banyak tenant.</p>
              </div>
            </div>

            <div className="hero-product reveal-scale reveal-delay-2" aria-label="Preview dashboard WACentral">
              <div className="hero-product__halo" />
              <div className="hero-product__window">
                <div className="hero-product__topbar">
                  <div className="hero-product__brand"><span className="brand-mark brand-mark--tiny"><span>W</span></span> WACentral</div>
                  <div className="hero-product__search">Cari percakapan...</div>
                  <div className="hero-product__profile">HA</div>
                </div>
                <div className="hero-product__body">
                  <aside className="hero-product__sidebar">
                    <div className="mini-nav mini-nav--active"><MessageCircle size={15} /> <span>Inbox</span><b>12</b></div>
                    <div className="mini-nav"><Users size={15} /> <span>Kontak</span></div>
                    <div className="mini-nav"><Bot size={15} /> <span>AI Agent</span></div>
                    <div className="mini-nav"><Zap size={15} /> <span>Campaign</span></div>
                    <div className="hero-product__status"><i /> Gateway aktif</div>
                  </aside>
                  <div className="hero-product__list">
                    <div className="hero-product__listhead"><div><strong>Inbox</strong><small>Semua percakapan</small></div><span>+ Baru</span></div>
                    {messages.map((message) => (
                      <div key={message.name} className={`message-row ${message.active ? 'message-row--active' : ''}`}>
                        <div className="message-avatar">{message.name.split(' ').map((part) => part[0]).join('')}</div>
                        <div><strong>{message.name}</strong><p>{message.text}</p></div>
                        <time>{message.time}</time>
                      </div>
                    ))}
                  </div>
                  <div className="hero-product__chat">
                    <div className="chat-head">
                      <div className="message-avatar">RP</div>
                      <div><strong>Rani Putri</strong><small><i /> Online via WhatsApp</small></div>
                      <span>•••</span>
                    </div>
                    <div className="chat-canvas">
                      <div className="chat-date">Hari ini, 10:42</div>
                      <div className="chat-bubble chat-bubble--incoming">Apakah pesanan saya bisa dikirim hari ini?<time>10:42</time></div>
                      <div className="chat-ai-chip"><Sparkles size={12} /> AI menyiapkan jawaban</div>
                      <div className="chat-bubble chat-bubble--outgoing">Bisa, Kak Rani. Pesanan sudah siap dan akan dijadwalkan pickup siang ini.<time>10:43 ✓✓</time></div>
                    </div>
                    <div className="chat-compose"><span>Tulis balasan...</span><button><ArrowRight size={15} /></button></div>
                  </div>
                </div>
              </div>
              <div className="floating-metric floating-metric--top">
                <span><Zap size={15} /></span><div><small>First response</small><strong>↓ 42%</strong></div>
              </div>
              <div className="floating-metric floating-metric--bottom">
                <span><ShieldCheck size={15} /></span><div><small>AI confidence</small><strong>94.8%</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section className="capability-ticker" aria-label="Kapabilitas platform">
          <div className="capability-ticker__track">
            {[...capabilities, ...capabilities].map((item, index) => (
              <span key={`${item}-${index}`}>{item}<i /></span>
            ))}
          </div>
        </section>

        <section id="platform" className="landing-section landing-section--light">
          <div className="landing-container">
            <div className="section-heading">
              <div><span className="section-index">01 / PLATFORM</span><h2>Bukan sekadar inbox.<br /><em>Pusat kendali pertumbuhan.</em></h2></div>
              <p>Setiap fitur dirancang untuk mengurangi perpindahan aplikasi, memperjelas ownership, dan menjaga kualitas layanan saat volume meningkat.</p>
            </div>

            <div className="bento-grid">
              <article className="bento-card bento-card--large bento-card--ink">
                <div className="bento-card__tag"><MessageCircle size={15} /> UNIFIED INBOX</div>
                <h3>Semua percakapan.<br />Satu konteks utuh.</h3>
                <p>Distribusikan chat, lihat histori, status, catatan internal, dan penanggung jawab tanpa kehilangan konteks pelanggan.</p>
                <div className="inbox-visual">
                  {messages.map((message, index) => <div key={message.name} style={{ '--delay': `${index * 100}ms` } as React.CSSProperties}><span>{message.name.slice(0, 1)}</span><p><strong>{message.name}</strong><small>{message.text}</small></p><time>{message.time}</time></div>)}
                </div>
              </article>
              <article className="bento-card bento-card--violet">
                <div className="bento-card__tag"><Bot size={15} /> AI COPILOT</div>
                <h3>AI yang memahami bisnis Anda.</h3>
                <p>Knowledge base, FAQ, confidence control, dan eskalasi manusia dalam satu alur aman.</p>
                <div className="ai-orbit"><span className="ai-orbit__core"><Sparkles /></span><i /><i /><i /></div>
              </article>
              <article className="bento-card bento-card--white">
                <div className="bento-card__tag"><Clock3 size={15} /> REALTIME</div>
                <h3>Keputusan tanpa menunggu laporan akhir bulan.</h3>
                <div className="metric-stack"><span><small>Response time</small><strong>1m 48s</strong><i className="good">−18%</i></span><span><small>Resolution rate</small><strong>91.2%</strong><i className="good">+7%</i></span></div>
              </article>
              <article className="bento-card bento-card--wide bento-card--acid">
                <div><div className="bento-card__tag"><Zap size={15} /> CAMPAIGN ENGINE</div><h3>Dari percakapan<br />menjadi revenue.</h3><p>Segmentasikan kontak, personalisasi template, jadwalkan broadcast, lalu pantau hasilnya.</p></div>
                <div className="campaign-visual"><span>Campaign terkirim</span><strong>12.480</strong><div><i style={{ height: '38%' }} /><i style={{ height: '60%' }} /><i style={{ height: '48%' }} /><i style={{ height: '82%' }} /><i style={{ height: '68%' }} /><i style={{ height: '94%' }} /></div></div>
              </article>
            </div>
          </div>
        </section>

        <section id="roles" className="landing-section landing-section--dark">
          <div className="landing-container">
            <div className="section-heading section-heading--dark">
              <div><span className="section-index">02 / ROLE-BASED</span><h2>Satu sistem.<br /><em>Tiga sudut kendali.</em></h2></div>
              <p>Setiap role mendapatkan informasi dan aksi yang relevan. Tidak berisik, tidak membingungkan, dan tetap terhubung.</p>
            </div>
            <div className="role-grid">
              {roleCards.map((role) => (
                <article key={role.number} className="role-card">
                  <span className="role-card__number">{role.number}</span>
                  <div className="role-card__icon">{role.number === '01' ? <ShieldCheck /> : role.number === '02' ? <Users /> : <Headphones />}</div>
                  <small>{role.eyebrow}</small><h3>{role.title}</h3><p>{role.copy}</p>
                  <ul>{role.items.map((item) => <li key={item}><Check size={14} /> {item}</li>)}</ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="landing-section landing-section--light workflow-section">
          <div className="landing-container">
            <div className="section-heading">
              <div><span className="section-index">03 / FLOW</span><h2>Lebih sedikit klik.<br /><em>Lebih banyak selesai.</em></h2></div>
            </div>
            <div className="workflow-grid">
              <div className="workflow-copy">
                {[['01', 'Pesan masuk', 'Semua chat masuk ke antrean bersama dengan identitas dan histori pelanggan.'], ['02', 'Routing cerdas', 'Sistem meneruskan ke staf yang tepat atau AI sesuai aturan operasional.'], ['03', 'Respons terkontrol', 'AI membantu menyusun jawaban; staf tetap memegang keputusan dan eskalasi.'], ['04', 'Insight tercatat', 'Setiap aksi menjadi data untuk performa, coaching, dan keputusan berikutnya.']].map(([number, title, copy]) => (
                  <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></article>
                ))}
              </div>
              <div className="workflow-orbit" aria-label="Alur pesan ke insight">
                <div className="workflow-orbit__ring workflow-orbit__ring--one" />
                <div className="workflow-orbit__ring workflow-orbit__ring--two" />
                <div className="workflow-orbit__center"><span className="brand-mark"><span>W</span></span><strong>One<br />workspace</strong></div>
                <span className="workflow-node workflow-node--one"><MessageCircle />Pesan</span>
                <span className="workflow-node workflow-node--two"><Bot />AI</span>
                <span className="workflow-node workflow-node--three"><Users />Tim</span>
                <span className="workflow-node workflow-node--four"><Zap />Insight</span>
              </div>
            </div>
          </div>
        </section>

        <section id="results" className="results-band">
          <div className="landing-container results-grid">
            <div><span>Respons pertama</span><strong>42<small>%</small></strong><p>lebih cepat dengan routing dan AI assistance.</p></div>
            <div><span>Conversation visibility</span><strong>100<small>%</small></strong><p>percakapan, ownership, dan status terlihat tim.</p></div>
            <div><span>Channel workspace</span><strong>1<small>x</small></strong><p>satu pusat operasi untuk CS, AI, dan marketing.</p></div>
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-grid" aria-hidden="true" />
          <div className="landing-container landing-cta__inner">
            <span className="section-index">READY WHEN YOU ARE</span>
            <h2>Customer service yang tumbuh<br /><em>tanpa menambah kekacauan.</em></h2>
            <p>Mulai dari tim kecil. Siap berkembang menjadi operasi multi-tenant.</p>
            <div><Link to="/subscribe" className="landing-button landing-button--light">Mulai sekarang <ArrowRight size={18} /></Link><Link to="/login" className="landing-button landing-button--outline-light">Masuk dashboard</Link></div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer__top">
          <div><Link to="/" className="landing-brand"><span className="brand-mark"><span>W</span></span><span className="landing-brand__text">WA<span>Central</span></span></Link><p>AI-powered customer service operations<br />untuk bisnis yang siap scale.</p></div>
          <div><small>Platform</small><a href="#platform">Unified Inbox</a><a href="#platform">AI Agent</a><a href="#platform">Campaign</a></div>
          <div><small>Workspace</small><a href="#roles">Super Admin</a><a href="#roles">Owner</a><a href="#roles">Staff</a></div>
          <div><small>Access</small><Link to="/login">Masuk</Link><Link to="/subscribe">Langganan</Link></div>
        </div>
        <div className="landing-container landing-footer__bottom"><span>© 2026 WACentral by myaicustom.com</span><span>Built for ambitious service teams.</span></div>
      </footer>
    </div>
  );
};

export default LandingPage;
