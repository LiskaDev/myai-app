import { ref } from 'vue';
import { deleteNovelMessages, deleteAllBookMessages, saveNovelMessages } from './useNovelDB.js';

const STORAGE_KEY = 'myai_bookList_v1';

// 模块级单例状态——所有调用 useNovelStore() 的组件共享同一份 bookList
const bookList = ref([]);

export function useNovelStore() {

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

  function createBook({ title, coverEmoji = '📖', worldEntries = [], novelModel = null, style = 'xianxia', difficulty = 1, pace = 'auto' }) {
    const book = {
      id: crypto.randomUUID(),
      title,
      coverEmoji,
      createdAt: Date.now(),
      style,
      difficulty,
      pace,
      worldEntries,
      saves: [null, null, null, null],
      novelModel: novelModel && novelModel.apiKey ? novelModel : null,
    };
    bookList.value.push(book);
    saveBooks();
    return book;
  }

  /**
   * 导入覆盖：用导入的元数据全量替换现有书籍，再写各存档 IndexedDB
   * @param {object} existingBook 现有书籍对象（保留其 id）
   * @param {object} importedData 导入 JSON 的完整内容
   */
  async function replaceBook(existingBook, importedData) {
    const idx = bookList.value.findIndex(b => b.id === existingBook.id);
    if (idx === -1) return;
    // 先删实旧的 IDB
    await deleteAllBookMessages(existingBook.id);
    // 更新元数据（保留本地 id)
    const { bookMeta, worldEntries, saves } = importedData;
    const newBook = {
      ...existingBook,
      title:       bookMeta.title,
      coverEmoji:  bookMeta.coverEmoji || '📖',
      style:       bookMeta.style || 'xianxia',
      difficulty:  bookMeta.difficulty ?? 1,
      pace:        bookMeta.pace || 'auto',
      worldEntries: worldEntries || [],
      saves: [null, null, null, null],
    };
    // 写入存档元数据（不含 messages）
    for (const s of (saves || [])) {
      if (s && s.slotIndex != null) {
        const { messages, ...meta } = s;
        newBook.saves[s.slotIndex] = { ...meta, updatedAt: meta.savedAt || Date.now() };
      }
    }
    bookList.value[idx] = newBook;
    saveBooks();
    // 写入 IDB messages
    for (const s of (saves || [])) {
      if (s && s.slotIndex != null && Array.isArray(s.messages)) {
        await saveNovelMessages(existingBook.id, s.slotIndex, s.messages);
      }
    }
    return newBook;
  }

  /**
   * 导入新建：创建新书籍并写入所有存档
   */
  async function importAsNew(importedData) {
    const { bookMeta, worldEntries, saves } = importedData;
    const book = createBook({
      title:        bookMeta.title,
      coverEmoji:   bookMeta.coverEmoji || '📖',
      worldEntries: worldEntries || [],
      style:        bookMeta.style || 'xianxia',
      difficulty:   bookMeta.difficulty ?? 1,
      pace:         bookMeta.pace || 'auto',
    });
    // 写入存档元数据
    for (const s of (saves || [])) {
      if (s && s.slotIndex != null) {
        const { messages, ...meta } = s;
        book.saves[s.slotIndex] = { ...meta, slotIndex: s.slotIndex, updatedAt: meta.savedAt || Date.now() };
      }
    }
    saveBooks();
    // 写入 IDB messages
    for (const s of (saves || [])) {
      if (s && s.slotIndex != null && Array.isArray(s.messages)) {
        await saveNovelMessages(book.id, s.slotIndex, s.messages);
      }
    }
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

  function createSave(bookId, slotIndex, { label, state, chapterTitle = '', chapterSummaries = [] }) {
    const book = bookList.value.find(b => b.id === bookId);
    if (!book) return null;
    const saveData = {
      slotIndex,
      label: label || `存档${slotIndex + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapterTitle,
      chapterSummaries,
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
    replaceBook,
    importAsNew,
  };
}
