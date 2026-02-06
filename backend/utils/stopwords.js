// Common Indonesian stopwords to filter out from analysis
const stopwords = new Set([
  'yang', 'di', 'dan', 'itu', 'dengan', 'untuk', 'tidak', 'ini', 'dari', 'dalam',
  'akan', 'pada', 'juga', 'saya', 'ke', 'karena', 'tersebut', 'bisa', 'ada',
  'mereka', 'lebih', 'sudah', 'atau', 'saat', 'oleh', 'sebagai', 'menjadi',
  'satu', 'masih', 'hanya', 'tentang', 'kita', 'kami', 'anda', 'kamu', 'dia',
  'ia', 'telah', 'kepada', 'bukan', 'seperti', 'bagi', 'harus', 'dapat', 'belum',
  'banyak', 'beberapa', 'antara', 'lain', 'setelah', 'jika', 'adalah', 'kapan',
  'dimana', 'kenapa', 'bagaimana', 'apakah', 'siapa', 'halo', 'hai', 'pagi',
  'siang', 'sore', 'malam', 'terima', 'kasih', 'makasih', 'tolong', 'mohon',
  'minta', 'mau', 'ingin', 'tapi', 'tetapi', 'namun', 'lalu', 'kemudian',
  'sedang', 'lagi', 'pun', 'saja', 'ya', 'tidak', 'gak', 'nggak', 'bgt',
  'banget', 'aja', 'aku', 'gw', 'gue', 'lu', 'lo', 'kalo', 'kl', 'klo',
  'yg', 'utk', 'dgn', 'sy', 'bapak', 'ibu', 'kak', 'gan', 'sis', 'min',
  'admin', 'kakak', 'mas', 'mbak', 'pak', 'buk', 'bu', 'om', 'tante',
  'oke', 'ok', 'baik', 'siap', 'iya', 'bisa', 'boleh', 'kah', 'dong',
  'deh', 'kok', 'kan', 'nih', 'tuh', 'sih', 'nya'
]);

/**
 * Filter text to return only meaningful words
 * @param {string} text 
 * @returns {string[]}
 */
const extractKeywords = (text) => {
  if (!text) return [];
  
  // Lowercase and remove punctuation (keep only letters and numbers)
  const cleanText = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  
  // Split by whitespace
  const words = cleanText.split(/\s+/);
  
  // Filter stopwords and short words
  return words.filter(word => 
    word.length > 2 && !stopwords.has(word)
  );
};

module.exports = {
  stopwords,
  extractKeywords
};
