import { ref } from 'vue';
import { deleteNovelMessages, deleteAllBookMessages } from './useNovelDB.js';

const STORAGE_KEY = 'myai_bookList_v1';

export function useNovelStore() {
  const bookList = ref([]);

  function loadBooks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      bookList.value = raw ? JSON.parse(raw) : [];
    } catch {
      bookList.value = [];
    }
  }

  function saveBooks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookList.value));
  }

  function createBook({ title, coverEmoji = '📖', worldEntries = [] }) {
    const book = {
      id: crypto.randomUUID(),
      title,
      coverEmoji,
      createdAt: Date.now(),
      style: 'xianxia',
      difficulty: 1,
      worldEntries,
      saves: [null, null, null, null],
    };
    bookList.value.push(book);
    saveBooks();
    return book;
  }

  function updateBook(bookId, updates) {
    const book = bookList.value.find(b => b.id === bookId);
    if (book) {
      Object.assign(book, updates);
      saveBooks();
    }
  }

  async function deleteBook(bookId) {
    const idx = bookList.value.findIndex(b => b.id === bookId);
    if (idx !== -1) {
      bookList.value.splice(idx, 1);
      saveBooks();
    }
    await deleteAllBookMessages(bookId);
  }

  function createSave(bookId, slotIndex, { label, state, messages = [], chapterTitle = '' }) {
    const book = bookList.value.find(b => b.id === bookId);
    if (!book) return null;
    const saveData = {
      slotIndex,
      label: label || `存档${slotIndex + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapterTitle,
      state: state || {},
      // messages 不再存入 localStorage，由调用方写入 IndexedDB
    };
    book.saves[slotIndex] = saveData;
    saveBooks();
    return saveData;
  }

  function updateSave(bookId, slotIndex, updates) {
    const book = bookList.value.find(b => b.id === bookId);
    if (!book || !book.saves[slotIndex]) return;
    // messages 不存入 localStorage，从 updates 中剔除
    const { messages, ...safeUpdates } = updates;
    Object.assign(book.saves[slotIndex], { ...safeUpdates, updatedAt: Date.now() });
    saveBooks();
  }

  async function deleteSave(bookId, slotIndex) {
    const book = bookList.value.find(b => b.id === bookId);
    if (book) {
      book.saves[slotIndex] = null;
      saveBooks();
    }
    await deleteNovelMessages(bookId, slotIndex);
  }

  function getBook(bookId) {
    return bookList.value.find(b => b.id === bookId) || null;
  }

  return {
    bookList,
    loadBooks,
    saveBooks,
    createBook,
    updateBook,
    deleteBook,
    createSave,
    updateSave,
    deleteSave,
    getBook,
  };
}
