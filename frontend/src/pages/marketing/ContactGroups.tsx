import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckSquare, Loader2, Plus, RefreshCcw, Search, Square, UserPlus, Users } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';

interface ContactGroup {
  id: string;
  name: string;
  description?: string | null;
  member_count?: number | string;
}

interface Contact {
  id?: string;
  full_name?: string | null;
  display_name?: string | null;
  name?: string | null;
  pushName?: string | null;
  shortName?: string | null;
  phone_number?: string | null;
  phone?: string | null;
  jid?: string | null;
}

const getContactName = (contact: Contact) => (
  contact.full_name
  || contact.display_name
  || contact.name
  || contact.pushName
  || contact.shortName
  || getContactPhone(contact)
  || 'Tanpa nama'
);

const getContactPhone = (contact: Contact) => (
  contact.phone_number
  || contact.phone
  || (contact.jid ? contact.jid.split('@')[0] : '')
  || ''
);

const ContactGroups = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsSource, setContactsSource] = useState('');
  const [contactsMessage, setContactsMessage] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [selectedGroup, setSelectedGroup] = useState<ContactGroup | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadGroups = async () => {
    try {
      const res = await api.get('/marketing/groups');
      if (res.data?.status === 'success') {
        setGroups(res.data.data || []);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal memuat group');
    }
  };

  const loadContacts = async () => {
    try {
      const res = await api.get('/contacts');
      if (res.data?.success) {
        setContacts(res.data.contacts || []);
        setContactsSource(res.data.source || '');
        setContactsMessage(res.data.message || '');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal memuat kontak');
    }
  };

  useEffect(() => {
    void loadGroups();
    void loadContacts();
  }, []);

  const validContacts = useMemo(() => contacts.filter((contact) => Boolean(contact.id)), [contacts]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return contacts.filter((contact) => {
      const nameValue = getContactName(contact).toLowerCase();
      const phoneValue = getContactPhone(contact);
      return !q || nameValue.includes(q) || phoneValue.includes(q);
    });
  }, [contacts, searchQuery]);

  const selectableFilteredContacts = useMemo(
    () => filteredContacts.filter((contact) => Boolean(contact.id)),
    [filteredContacts],
  );

  const selectedGroupCount = groups.reduce((sum, group) => sum + Number(group.member_count || 0), 0);
  const isAllSelected = selectableFilteredContacts.length > 0
    && selectableFilteredContacts.every((contact) => contact.id && selectedContactIds.includes(contact.id));

  const handleSelectAll = () => {
    const visibleIds = selectableFilteredContacts
      .map((contact) => contact.id)
      .filter((id): id is string => Boolean(id));

    if (isAllSelected) {
      setSelectedContactIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }

    setSelectedContactIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const openModal = (group: ContactGroup) => {
    setSelectedGroup(group);
    setSelectedContactIds([]);
    setSearchQuery('');
    setIsModalOpen(true);
    void loadContacts();
  };

  const toggleContact = (contactId?: string) => {
    if (!contactId) {
      toast.error('Kontak ini belum tersimpan di database. Jalankan Sync Kontak dulu.');
      return;
    }
    setSelectedContactIds((prev) => (
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    ));
  };

  const handleCreateGroup = async () => {
    if (!name.trim()) {
      toast.error('Nama group wajib diisi');
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.post('/marketing/groups', { name, description });
      if (res.data?.status === 'success') {
        toast.success('Group berhasil dibuat');
        setName('');
        setDescription('');
        await loadGroups();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal membuat group');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncContacts = async () => {
    setIsSyncing(true);
    try {
      const res = await api.post('/sync/contacts');
      toast.success(res.data?.message || 'Kontak berhasil disinkronkan');
      await loadContacts();
      await loadGroups();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal sync kontak WhatsApp');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddMembers = async () => {
    if (!selectedGroup) return;
    if (selectedContactIds.length === 0) {
      toast.error('Pilih minimal 1 kontak');
      return;
    }
    try {
      const res = await api.post(`/marketing/groups/${selectedGroup.id}/members`, {
        contact_ids: selectedContactIds,
      });
      if (res.data?.status === 'success') {
        toast.success(`${res.data.added || selectedContactIds.length} member berhasil ditambahkan`);
        setIsModalOpen(false);
        await loadGroups();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal menambahkan member');
    }
  };

  return (
    <div className="crm-page">
      <div className="crm-page-header">
        <div>
          <button
            onClick={() => navigate('/admin/marketing')}
            className="mb-3 text-sm font-bold text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300"
          >
            ← Kembali ke Marketing
          </button>
          <h1 className="crm-page-title">Contact Segments</h1>
          <p className="crm-page-subtitle">
            Sync kontak WhatsApp, bikin segment, lalu pilih target campaign tanpa ribet.
          </p>
        </div>
        <button
          onClick={handleSyncContacts}
          disabled={isSyncing}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/15 transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
        >
          {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCcw size={18} />}
          Sync Kontak WhatsApp
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Segments', value: groups.length.toLocaleString('id-ID'), hint: 'group target campaign', icon: <Users className="text-blue-600" /> },
          { label: 'Kontak siap pilih', value: validContacts.length.toLocaleString('id-ID'), hint: contactsSource ? `source: ${contactsSource}` : 'tersimpan di database', icon: <CheckSquare className="text-emerald-600" /> },
          { label: 'Total member', value: selectedGroupCount.toLocaleString('id-ID'), hint: 'akumulasi semua segment', icon: <UserPlus className="text-violet-600" /> },
        ].map((card) => (
          <div key={card.label} className="crm-surface">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{card.label}</p>
                <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white">{card.value}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{card.hint}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {(contactsMessage || (contacts.length > 0 && validContacts.length === 0)) && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={20} />
            <div>
              <p className="font-black">Kontak belum siap untuk campaign.</p>
              <p className="mt-1 text-sm leading-6">
                {contactsMessage || 'Kontak dari gateway belum punya ID database. Klik Sync Kontak WhatsApp agar bisa dipilih ke segment.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)] xl:items-start">
        <section className="crm-surface space-y-5">
          <div>
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-800">
              <Plus size={20} />
            </div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Buat Segment Baru</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Segment adalah group kontak yang nantinya jadi target campaign.
            </p>
          </div>
          <div className="space-y-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder="Contoh: Customer Repeat Order"
            />
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder="Deskripsi opsional"
            />
          </div>
          <button
            onClick={handleCreateGroup}
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-slate-950"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            Simpan Segment
          </button>
        </section>

        <section className="grid gap-4">
          {groups.map((group) => (
            <div
              key={group.id}
              className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-blue-900"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-lg font-black text-slate-950 dark:text-white">{group.name}</p>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {Number(group.member_count || 0).toLocaleString('id-ID')} member
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {group.description || 'Tanpa deskripsi'}
                  </p>
                </div>
                <button
                  onClick={() => openModal(group)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <UserPlus size={16} />
                  Kelola Member
                </button>
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900/60">
              <Users className="mx-auto text-slate-300" size={42} />
              <p className="mt-4 text-lg font-black text-slate-900 dark:text-white">Belum ada segment.</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Buat segment pertama, lalu masukkan kontak dari database WhatsApp.
              </p>
            </div>
          )}
        </section>
      </div>

      {isModalOpen && selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-[2rem] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <div className="shrink-0 border-b border-slate-100 p-5 dark:border-slate-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black text-slate-950 dark:text-white">Kelola Member</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Tambahkan kontak ke <strong>{selectedGroup.name}</strong>.
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Tutup
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-3 md:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    placeholder="Cari nama atau nomor..."
                  />
                </div>
                <button
                  onClick={handleSyncContacts}
                  disabled={isSyncing}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition-all hover:bg-blue-100 active:scale-[0.98] disabled:opacity-60 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
                >
                  {isSyncing ? <Loader2 size={17} className="animate-spin" /> : <RefreshCcw size={17} />}
                  Sync
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
                <button
                  onClick={handleSelectAll}
                  disabled={selectableFilteredContacts.length === 0}
                  className="inline-flex items-center gap-2 text-sm font-black text-blue-600 transition-colors hover:text-blue-700 disabled:text-slate-400 dark:text-blue-300"
                >
                  {isAllSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                  {isAllSelected ? 'Batalkan yang tampil' : 'Pilih semua yang tampil'}
                </button>
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
                  {selectedContactIds.length} dipilih
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="space-y-2">
                {filteredContacts.map((contact) => {
                  const contactId = contact.id;
                  const canSelect = Boolean(contactId);
                  const displayName = getContactName(contact);
                  const phone = getContactPhone(contact);

                  return (
                    <label
                      key={contactId || contact.jid || phone || displayName}
                      className={`flex items-center justify-between gap-4 rounded-2xl border p-4 transition-all ${
                        canSelect
                          ? 'cursor-pointer border-slate-200 hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-800 dark:hover:border-blue-900 dark:hover:bg-blue-950/20'
                          : 'cursor-not-allowed border-amber-200 bg-amber-50/60 opacity-80 dark:border-amber-900/40 dark:bg-amber-950/20'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950 dark:text-white">{displayName}</p>
                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{phone || contact.jid || '-'}</p>
                        {!canSelect && (
                          <p className="mt-1 text-xs font-bold text-amber-700 dark:text-amber-300">Perlu Sync Kontak dulu</p>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                        disabled={!canSelect}
                        checked={Boolean(contactId && selectedContactIds.includes(contactId))}
                        onChange={() => toggleContact(contactId)}
                      />
                    </label>
                  );
                })}
                {filteredContacts.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Kontak tidak ditemukan. Coba sync kontak WhatsApp atau ubah kata kunci.
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-100 p-5 dark:border-slate-800 sm:flex-row sm:justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                onClick={handleAddMembers}
                disabled={selectedContactIds.length === 0}
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition-all hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Simpan {selectedContactIds.length > 0 ? `(${selectedContactIds.length})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactGroups;
