import { useEffect, useMemo, useState } from 'react';
import { Users, UserPlus, Plus, CheckSquare, Square } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';

interface ContactGroup {
  id: string;
  name: string;
  description?: string | null;
  member_count?: number | string;
}

interface Contact {
  id: string;
  full_name?: string | null;
  display_name?: string | null;
  phone_number?: string | null;
  jid?: string | null;
}

const ContactGroups = () => {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal memuat kontak');
    }
  };

  useEffect(() => {
    void loadGroups();
    void loadContacts();
  }, []);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return contacts.filter((c) => {
      const nameValue = (c.full_name || c.display_name || '').toLowerCase();
      const phoneValue = c.phone_number || '';
      return nameValue.includes(q) || phoneValue.includes(q);
    });
  }, [contacts, searchQuery]);

  // --- Logic Select All ---
  const isAllSelected = filteredContacts.length > 0 && filteredContacts.every((c) => selectedContactIds.includes(c.id));

  const handleSelectAll = () => {
    if (isAllSelected) {
      // Unselect filtered
      const idsToRemove = filteredContacts.map(c => c.id);
      setSelectedContactIds(prev => prev.filter(id => !idsToRemove.includes(id)));
    } else {
      // Select all filtered
      const idsToAdd = filteredContacts.map(c => c.id);
      setSelectedContactIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
    }
  };

  const openModal = (group: ContactGroup) => {
    setSelectedGroup(group);
    setSelectedContactIds([]);
    setSearchQuery('');
    setIsModalOpen(true);
  };

  const toggleContact = (contactId: string) => {
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

  const handleAddMembers = async () => {
    if (!selectedGroup) return;
    if (selectedContactIds.length === 0) {
      toast.error('Pilih minimal 1 kontak');
      return;
    }
    try {
      const res = await api.post(`/marketing/groups/${selectedGroup.id}/members`, {
        contact_ids: selectedContactIds
      });
      if (res.data?.status === 'success') {
        toast.success('Member berhasil ditambahkan');
        setIsModalOpen(false);
        await loadGroups();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal menambahkan member');
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Contact Groups</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Segmentasi kontak untuk kebutuhan blast.
          </p>
        </div>
        <div className="flex items-center gap-2 text-blue-600">
          <Users size={20} />
          <span className="text-sm font-semibold">{groups.length} group</span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Plus size={18} />
          Buat Group Baru
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
            placeholder="Nama group"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
            placeholder="Deskripsi (opsional)"
          />
        </div>
        <button
          onClick={handleCreateGroup}
          disabled={isLoading}
          className="px-5 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
        >
          {isLoading ? 'Menyimpan...' : 'Simpan Group'}
        </button>
      </div>

      <div className="grid gap-4">
        {groups.map((group) => (
          <div
            key={group.id}
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
          >
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{group.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {group.description || 'Tanpa deskripsi'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {group.member_count || 0} member
              </span>
              <button
                onClick={() => openModal(group)}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-900 flex items-center gap-2"
              >
                <UserPlus size={16} />
                Tambah Member
              </button>
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Belum ada group. Buat group pertama kamu.
          </div>
        )}
      </div>

      {isModalOpen && selectedGroup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-2xl space-y-4 border border-gray-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Tambah Member ke {selectedGroup.name}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Tutup
              </button>
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white shrink-0"
              placeholder="Cari kontak..."
            />
            
            <div className="flex items-center justify-between px-2 shrink-0">
              <button 
                onClick={handleSelectAll}
                className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                {isAllSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                {isAllSelected ? 'Batalkan Semua' : 'Pilih Semua (Yang Tampil)'}
              </button>
              <span className="text-sm text-gray-500">
                {selectedContactIds.length} terpilih
              </span>
            </div>

            <div className="flex-1 overflow-y-auto border border-gray-100 dark:border-slate-800 rounded-xl min-h-0">
              {filteredContacts.map((contact) => (
                <label
                  key={contact.id}
                  className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {contact.full_name || contact.display_name || 'Tanpa nama'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {contact.phone_number || contact.jid || '-'}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                    checked={selectedContactIds.includes(contact.id)}
                    onChange={() => toggleContact(contact.id)}
                  />
                </label>
              ))}
              {filteredContacts.length === 0 && (
                <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  Kontak tidak ditemukan.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 shrink-0 pt-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700"
              >
                Batal
              </button>
              <button
                onClick={handleAddMembers}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-semibold"
              >
                Simpan ({selectedContactIds.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactGroups;