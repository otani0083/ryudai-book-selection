import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Download, 
  BookOpen, 
  ExternalLink, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Info, 
  X,
  FileSpreadsheet,
  Globe,
  Check,
  EyeOff,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

// Helper to format NDC to string safely (avoids React object rendering crash)
const formatNDC = (ndc) => {
  if (!ndc) return '不明';
  if (typeof ndc === 'string') return ndc;
  if (typeof ndc === 'number') return String(ndc);
  if (Array.isArray(ndc)) {
    return ndc
      .map(item => {
        if (typeof item === 'string') return item;
        if (typeof item === 'number') return String(item);
        if (item && typeof item === 'object') {
          return item['#text'] || item.text || JSON.stringify(item);
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof ndc === 'object') {
    return ndc['#text'] || ndc.text || JSON.stringify(ndc);
  }
  return String(ndc);
};

export default function App() {
  const [data, setData] = useState({ lastUpdated: null, books: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('okinawa-ja'); // okinawa-ja, okinawa-en, academic
  const [statusFilter, setStatusFilter] = useState('all'); // all, owned, missing
  const [sortBy, setSortBy] = useState('newest'); // newest, title, status
  
  // Selection check states for CSV Export
  const [checkedIsbns, setCheckedIsbns] = useState(new Set());
  
  // User processed states stored in LocalStorage
  // Maps ISBN -> 'selected' | 'unnecessary' | 'normal'
  const [userStatuses, setUserStatuses] = useState({});
  const [hideProcessed, setHideProcessed] = useState(true); // Hide processed by default

  // Accordion toggle states in Modal
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isTocExpanded, setIsTocExpanded] = useState(false);

  // Modal State
  const [selectedBook, setSelectedBook] = useState(null);

  // Fetch book selection data and load local storage
  useEffect(() => {
    fetchData();
    loadLocalStatuses();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}books_data.json`);
      if (!response.ok) {
        throw new Error('所蔵データが見つかりません。クローラーを実行してデータを生成してください。');
      }
      const jsonData = await response.json();
      setData(jsonData);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadLocalStatuses = () => {
    try {
      const stored = localStorage.getItem('ryudai_book_user_status');
      if (stored) {
        setUserStatuses(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load user statuses:', err);
    }
  };

  // Update processed status
  const handleUpdateUserStatus = (isbn, status) => {
    const updated = { ...userStatuses, [isbn]: status };
    setUserStatuses(updated);
    localStorage.setItem('ryudai_book_user_status', JSON.stringify(updated));
  };

  // Toggle user status: 'normal' <-> 'selected'
  const toggleSelectStatus = (isbn, e) => {
    if (e) e.stopPropagation();
    const current = userStatuses[isbn] || 'normal';
    const next = current === 'selected' ? 'normal' : 'selected';
    handleUpdateUserStatus(isbn, next);
  };

  // Toggle user status: 'normal' <-> 'unnecessary'
  const toggleUnnecessaryStatus = (isbn, e) => {
    if (e) e.stopPropagation();
    const current = userStatuses[isbn] || 'normal';
    const next = current === 'unnecessary' ? 'normal' : 'unnecessary';
    handleUpdateUserStatus(isbn, next);
  };

  // Category display names and tab configs
  const tabs = [
    { id: 'okinawa-ja', name: '沖縄・琉球・奄美 (和書)', color: 'okinawa-ja' },
    { id: 'okinawa-en', name: '沖縄・琉球・奄美 (洋書)', color: 'okinawa-en' },
    { id: 'academic', name: '一般学術書 (推薦)', color: 'academic' }
  ];

  // Helper to count items in each category (only active unprocessed ones if filter is active)
  const tabCounts = useMemo(() => {
    const counts = { 'okinawa-ja': 0, 'okinawa-en': 0, academic: 0 };
    data.books.forEach(book => {
      if (counts[book.category] !== undefined) {
        // If hideProcessed is checked, skip counting selected or unnecessary ones
        if (hideProcessed) {
          const status = userStatuses[book.isbn] || 'normal';
          if (status === 'selected' || status === 'unnecessary') {
            return;
          }
        }
        counts[book.category]++;
      }
    });
    return counts;
  }, [data.books, userStatuses, hideProcessed]);

  // Filter & Search & Sort Logic
  const filteredBooks = useMemo(() => {
    let result = data.books.filter(book => book.category === activeTab);

    // Hide processed books (selected/unnecessary) if toggle is active
    if (hideProcessed) {
      result = result.filter(book => {
        const uStat = userStatuses[book.isbn] || 'normal';
        return uStat !== 'selected' && uStat !== 'unnecessary';
      });
    }

    // Filter by Status
    if (statusFilter === 'owned') {
      result = result.filter(book => book.status === '所蔵あり');
    } else if (statusFilter === 'missing') {
      result = result.filter(book => book.status === '未所蔵');
    }

    // Filter by Search Query
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(book => 
        book.title?.toLowerCase().includes(query) ||
        book.author?.toLowerCase().includes(query) ||
        book.publisher?.toLowerCase().includes(query) ||
        book.isbn?.includes(query)
      );
    }

    // Sort Logic
    result.sort((a, b) => {
      if (sortBy === 'newest') {
        return String(b.pubDate).localeCompare(String(a.pubDate));
      } else if (sortBy === 'title') {
        return String(a.title).localeCompare(String(b.title), 'ja');
      } else if (sortBy === 'status') {
        return String(a.status).localeCompare(String(b.status), 'ja');
      }
      return 0;
    });

    return result;
  }, [data.books, activeTab, statusFilter, searchQuery, sortBy, userStatuses, hideProcessed]);

  // Checkbox handling for selections
  const handleSelectBook = (isbn, e) => {
    e.stopPropagation();
    const next = new Set(checkedIsbns);
    if (next.has(isbn)) {
      next.delete(isbn);
    } else {
      next.add(isbn);
    }
    setCheckedIsbns(next);
  };

  const handleSelectAll = () => {
    const next = new Set(checkedIsbns);
    const visibleIsbns = filteredBooks.map(b => b.isbn);
    const allChecked = visibleIsbns.every(isbn => checkedIsbns.has(isbn));

    if (allChecked) {
      // Uncheck all visible books
      visibleIsbns.forEach(isbn => next.delete(isbn));
    } else {
      // Check all visible books
      visibleIsbns.forEach(isbn => next.add(isbn));
    }
    setCheckedIsbns(next);
  };

  // Check if all visible books are checked
  const isAllChecked = useMemo(() => {
    if (filteredBooks.length === 0) return false;
    return filteredBooks.every(b => checkedIsbns.has(b.isbn));
  }, [filteredBooks, checkedIsbns]);

  // Clean selections when tab changes
  useEffect(() => {
    setCheckedIsbns(new Set());
  }, [activeTab]);

  // Export to CSV Function (Handles custom selections)
  const exportToCSV = () => {
    // If some books are selected via checkboxes, export only those.
    // Otherwise, export all books currently visible in the filtered list.
    const targetBooks = checkedIsbns.size > 0 
      ? data.books.filter(b => checkedIsbns.has(b.isbn))
      : filteredBooks;

    if (targetBooks.length === 0) return;
    
    // Define Headers
    const headers = ['ISBN', 'カテゴリ', 'タイトル', '著者', '出版社', '出版日', '分類(NDC)', '所蔵状況', '配架場所と状態', 'ユーザー選書状態', 'OPAC予約URL(所蔵あり) / 典拠URL(未所蔵)'];
    
    // Build rows
    const rows = targetBooks.map(book => {
      // Format holdings location detail
      let holdingDetail = '';
      if (book.libkey && Object.keys(book.libkey).length > 0) {
        holdingDetail = Object.entries(book.libkey)
          .map(([loc, stat]) => `${loc}: ${stat}`)
          .join(' | ');
      } else {
        holdingDetail = book.status === '未所蔵' ? '未所蔵' : '不明';
      }
      
      const categoryName = tabs.find(t => t.id === book.category)?.name || book.category;
      
      // Determine link based on status
      const link = book.status === '所蔵あり' 
        ? (book.reserveurl || `https://opac.lib.u-ryukyu.ac.jp/opc/search?q=${book.isbn}`)
        : (book.sourceUrl || '');

      const userStatusLabel = userStatuses[book.isbn] === 'selected' 
        ? '選書済' 
        : userStatuses[book.isbn] === 'unnecessary' 
          ? '所蔵不要' 
          : '未処理';
      
      return [
        book.isbn,
        categoryName,
        book.title,
        book.author,
        book.publisher,
        book.pubDate,
        formatNDC(book.ndc),
        book.status,
        holdingDetail,
        userStatusLabel,
        link
      ];
    });

    // Create CSV content with quotes to handle commas inside text
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Add UTF-8 BOM so Excel opens it correctly in Japanese
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    
    // Dynamic filename based on active category and selection count
    const dateStr = new Date().toISOString().split('T')[0];
    const categoryLabel = tabs.find(t => t.id === activeTab)?.name.replace(/\s+/g, '') || activeTab;
    const isSelectionExport = checkedIsbns.size > 0;
    const countLabel = isSelectionExport ? `${checkedIsbns.size}件選択` : '全表示件';
    
    link.setAttribute('download', `琉大選書_${categoryLabel}_${countLabel}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format date display
  const formatDateTime = (isoString) => {
    if (!isoString) return '未実施';
    const d = new Date(isoString);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Fallback covers helper
  const getCoverUrl = (isbn) => {
    if (!isbn) return null;
    if (activeTab === 'okinawa-en') {
      return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
    }
    return `https://covers.openbd.jp/${isbn}.jpg`;
  };

  // Modal expand states reset helper
  const handleOpenBookModal = (book) => {
    setSelectedBook(book);
    setIsDescExpanded(false);
    setIsTocExpanded(false);
  };

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <div className="header-logo">
          <BookOpen size={24} className="text-sea-emerald" />
          <h1>琉球大学附属図書館 選書支援</h1>
          <span>Beta</span>
        </div>
        <div className="last-updated">
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          最終更新: {formatDateTime(data.lastUpdated)}
        </div>
      </header>

      <main className="app-container">
        {/* Hero Section */}
        <section className="hero-section">
          <h2 className="hero-title">選書支援ダッシュボード</h2>
          <p className="hero-subtitle">
            沖縄県内の出版社や新聞書評から「沖縄・琉球・奄美」に関する地域資料、および総合大学として必要な「一般学術書」の新刊情報を集約し、琉大の所蔵状況を判定したリストです。
          </p>
        </section>

        {/* Error Notification */}
        {error && (
          <div style={{
            backgroundColor: 'var(--color-status-missing-bg)',
            color: 'var(--color-status-missing)',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <AlertCircle size={20} />
            <div>
              <p style={{ fontWeight: 700 }}>データの読み込みエラー</p>
              <p style={{ fontSize: '0.9rem' }}>{error}</p>
            </div>
            <button 
              onClick={fetchData} 
              className="btn-primary" 
              style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
            >
              再読み込み
            </button>
          </div>
        )}

        {/* Tab Selection */}
        <div className="tabs-wrapper" style={{ marginBottom: '1.5rem' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.name}
              <span className="tab-count">{tabCounts[tab.id]}</span>
            </button>
          ))}
        </div>

        {/* Control Panel */}
        <div className="control-panel">
          {/* Search Row */}
          <div className="search-filter-row">
            <div className="search-wrapper">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="タイトル、著者、出版社、ISBNで検索..."
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-light)'
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Filters and Actions Row */}
          <div className="filter-row">
            <div className="filter-group">
              <span className="filter-label">所蔵状況:</span>
              <div className="btn-group">
                <button
                  className={`btn-filter-status ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  すべて
                </button>
                <button
                  className={`btn-filter-status ${statusFilter === 'missing' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('missing')}
                >
                  未所蔵のみ
                </button>
                <button
                  className={`btn-filter-status ${statusFilter === 'owned' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('owned')}
                >
                  所蔵ありのみ
                </button>
              </div>
            </div>

            <div className="filter-group" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
              {/* Processed Toggle Filter */}
              <div className="toggle-filter-wrapper">
                <input
                  type="checkbox"
                  id="hide-processed-toggle"
                  checked={hideProcessed}
                  onChange={(e) => setHideProcessed(e.target.checked)}
                />
                <label htmlFor="hide-processed-toggle" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  選書済・不要を非表示にする
                </label>
              </div>

              <span className="filter-label">並び替え:</span>
              <select
                className="select-filter"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="newest">出版年月が新しい順</option>
                <option value="title">タイトル順</option>
                <option value="status">所蔵ステータス順</option>
              </select>

              <button
                className="btn-primary"
                onClick={exportToCSV}
                disabled={filteredBooks.length === 0 && checkedIsbns.size === 0}
                style={{ opacity: (filteredBooks.length === 0 && checkedIsbns.size === 0) ? 0.6 : 1 }}
              >
                <FileSpreadsheet size={16} />
                {checkedIsbns.size > 0 
                  ? `CSV出力 (${checkedIsbns.size}件選択中)` 
                  : `CSV出力 (全${filteredBooks.length}件)`}
              </button>
            </div>
          </div>
        </div>

        {/* Books List Section */}
        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>琉球大学図書館の蔵書情報を読み込み中...</p>
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="empty-state">
            <Info size={40} className="empty-state-icon" />
            <h3>該当する書籍が見つかりませんでした</h3>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              検索キーワードやフィルター設定を変更してお試しください。
            </p>
          </div>
        ) : (
          <div className="books-table-wrapper">
            <table className="books-table">
              <thead>
                <tr>
                  <th className="col-checkbox">
                    <input
                      type="checkbox"
                      checked={isAllChecked}
                      onChange={handleSelectAll}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </th>
                  <th style={{ width: '110px' }}>所蔵状況</th>
                  <th>タイトル</th>
                  <th>著者</th>
                  <th>出版社</th>
                  <th>出版年月</th>
                  <th>分類(NDC)</th>
                  <th style={{ width: '180px' }}>選書ステータス & リンク</th>
                </tr>
              </thead>
              <tbody>
                {filteredBooks.map((book) => {
                  const uStat = userStatuses[book.isbn] || 'normal';
                  let rowClass = '';
                  if (uStat === 'selected') rowClass = 'row-selected';
                  else if (uStat === 'unnecessary') rowClass = 'row-unnecessary';

                  return (
                    <tr 
                      key={book.isbn} 
                      onClick={() => handleOpenBookModal(book)}
                      className={rowClass}
                    >
                      <td className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checkedIsbns.has(book.isbn)}
                          onChange={(e) => handleSelectBook(book.isbn, e)}
                        />
                      </td>
                      <td data-label="所蔵状況">
                        <span className={`status-badge ${book.status === '所蔵あり' ? 'owned' : book.status === '未所蔵' ? 'missing' : 'checking'}`} style={{ display: 'inline-flex', width: 'fit-content' }}>
                          {book.status === '所蔵あり' ? (
                            <>
                              <CheckCircle size={12} />
                              所蔵あり
                            </>
                          ) : book.status === '未所蔵' ? (
                            <>
                              <AlertCircle size={12} />
                              未所蔵
                            </>
                          ) : (
                            <>
                              <RefreshCw size={12} className="spin" />
                              調査中
                            </>
                          )}
                        </span>
                      </td>
                      <td data-label="タイトル" className="book-title-cell" title={book.title}>
                        {book.title}
                      </td>
                      <td data-label="著者" className="book-author-cell" title={book.author}>
                        {book.author}
                      </td>
                      <td data-label="出版社" title={book.publisher}>
                        {book.publisher}
                      </td>
                      <td data-label="出版年月">
                        {book.pubDate}
                      </td>
                      <td data-label="分類(NDC)">
                        {formatNDC(book.ndc)}
                      </td>
                      <td data-label="選書判定 & リンク" onClick={(e) => e.stopPropagation()}>
                        <div className="table-actions">
                          {/* User Decision Toggles */}
                          <div className="quick-action-btns">
                            <button
                              className={`btn-quick ${uStat === 'selected' ? 'selected-active' : ''}`}
                              onClick={(e) => toggleSelectStatus(book.isbn, e)}
                              title={uStat === 'selected' ? '選書マークを解除' : '選書済みにする'}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              className={`btn-quick ${uStat === 'unnecessary' ? 'unnecessary-active' : ''}`}
                              onClick={(e) => toggleUnnecessaryStatus(book.isbn, e)}
                              title={uStat === 'unnecessary' ? '所蔵不要マークを解除' : '所蔵不要にする'}
                            >
                              <EyeOff size={14} />
                            </button>
                          </div>

                          {/* OPAC / Source link */}
                          {book.status === '所蔵あり' ? (
                            <a
                              href={book.reserveurl || `https://opac.lib.u-ryukyu.ac.jp/opc/search?q=${book.isbn}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-table-action btn-table-opac"
                            >
                              OPAC
                              <ExternalLink size={12} />
                            </a>
                          ) : book.sourceUrl ? (
                            <a
                              href={book.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-table-action btn-table-source"
                            >
                              典拠
                              <Globe size={12} />
                            </a>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Book Detail Modal */}
      {selectedBook && (
        <div className="modal-overlay" onClick={() => setSelectedBook(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className={`book-category-badge ${selectedBook.category}`}>
                {tabs.find(t => t.id === selectedBook.category)?.name}
              </span>
              <button className="modal-close-btn" onClick={() => setSelectedBook(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-book-profile">
                {/* Book Cover Image */}
                <img 
                  src={getCoverUrl(selectedBook.isbn)} 
                  alt={selectedBook.title}
                  className="modal-book-cover"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180" viewBox="0 0 120 180"><rect width="100%" height="100%" fill="%23f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="12" fill="%2394a3b8">No Image</text></svg>';
                  }}
                />
                
                <div className="modal-book-info">
                  <h2 className="modal-book-title">{selectedBook.title}</h2>
                  <p className="modal-book-author">{selectedBook.author}</p>
                  
                  <span 
                    className={`status-badge ${selectedBook.status === '所蔵あり' ? 'owned' : selectedBook.status === '未所蔵' ? 'missing' : 'checking'}`}
                    style={{ width: 'fit-content', fontSize: '0.85rem', padding: '0.35rem 0.75rem', marginBottom: '1rem' }}
                  >
                    {selectedBook.status === '所蔵あり' ? '琉大所蔵あり' : selectedBook.status === '未所蔵' ? '琉大未所蔵' : '所蔵状況調査中'}
                  </span>

                  {/* Quick Status Control Inside Modal */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                    <button
                      className={`btn-secondary ${userStatuses[selectedBook.isbn] === 'selected' ? 'selected-active' : ''}`}
                      onClick={() => toggleSelectStatus(selectedBook.isbn)}
                      style={{
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        backgroundColor: userStatuses[selectedBook.isbn] === 'selected' ? 'var(--color-status-owned-bg)' : '#ffffff',
                        borderColor: userStatuses[selectedBook.isbn] === 'selected' ? 'var(--color-status-owned)' : 'var(--border-color)',
                        color: userStatuses[selectedBook.isbn] === 'selected' ? 'var(--color-status-owned)' : 'var(--text-muted)'
                      }}
                    >
                      <Check size={14} />
                      選書済
                    </button>
                    <button
                      className={`btn-secondary ${userStatuses[selectedBook.isbn] === 'unnecessary' ? 'unnecessary-active' : ''}`}
                      onClick={() => toggleUnnecessaryStatus(selectedBook.isbn)}
                      style={{
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        backgroundColor: userStatuses[selectedBook.isbn] === 'unnecessary' ? 'var(--color-status-missing-bg)' : '#ffffff',
                        borderColor: userStatuses[selectedBook.isbn] === 'unnecessary' ? 'var(--color-status-missing)' : 'var(--border-color)',
                        color: userStatuses[selectedBook.isbn] === 'unnecessary' ? 'var(--color-status-missing)' : 'var(--text-muted)'
                      }}
                    >
                      <EyeOff size={14} />
                      所蔵不要
                    </button>
                  </div>
                </div>
              </div>

              {/* Book Metadata Table */}
              <table className="details-table">
                <tbody>
                  <tr>
                    <th>出版社</th>
                    <td>{selectedBook.publisher}</td>
                  </tr>
                  <tr>
                    <th>出版年月</th>
                    <td>{selectedBook.pubDate}</td>
                  </tr>
                  <tr>
                    <th>ISBN</th>
                    <td>{selectedBook.isbn}</td>
                  </tr>
                  <tr>
                    <th>分類 (NDC)</th>
                    <td>{formatNDC(selectedBook.ndc)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Content / Description Accordion */}
              {selectedBook.description && selectedBook.description !== 'Unknown' && (
                <div className="modal-expand-section">
                  <div 
                    className="expand-header" 
                    onClick={() => setIsDescExpanded(!isDescExpanded)}
                  >
                    <span>内容紹介・要約</span>
                    {isDescExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                  {isDescExpanded && (
                    <div className="expand-content">
                      {selectedBook.description}
                    </div>
                  )}
                </div>
              )}

              {/* TOC Accordion */}
              {selectedBook.toc && selectedBook.toc !== 'Unknown' && (
                <div className="modal-expand-section">
                  <div 
                    className="expand-header" 
                    onClick={() => setIsTocExpanded(!isTocExpanded)}
                  >
                    <span>目次情報</span>
                    {isTocExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                  {isTocExpanded && (
                    <div className="expand-content">
                      {selectedBook.toc}
                    </div>
                  )}
                </div>
              )}

              {/* Holdings Details Box */}
              <div className="holdings-info-box">
                <h3 className="holdings-title">
                  <BookOpen size={16} />
                  琉球大学附属図書館の蔵書詳細
                </h3>

                {selectedBook.status === '所蔵あり' && selectedBook.libkey && Object.keys(selectedBook.libkey).length > 0 ? (
                  <ul className="holdings-list">
                    {Object.entries(selectedBook.libkey).map(([loc, status]) => (
                      <li key={loc} className="holding-item">
                        <span className="holding-loc">{loc}</span>
                        <span className="holding-status">{status}</span>
                      </li>
                    ))}
                  </ul>
                ) : selectedBook.status === '未所蔵' ? (
                  <div className="holdings-empty">
                    この書籍は琉球大学附属図書館に所蔵されていません。選書・購入を検討してください。
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                    蔵書の詳細データがありません。
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={() => setSelectedBook(null)}
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
              >
                閉じる
              </button>
              
              {selectedBook.status === '所蔵あり' ? (
                <a
                  href={selectedBook.reserveurl || `https://opac.lib.u-ryukyu.ac.jp/opc/search?q=${selectedBook.isbn}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                >
                  OPACで配架を確認する
                  <ExternalLink size={14} />
                </a>
              ) : selectedBook.sourceUrl ? (
                <a
                  href={selectedBook.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ 
                    padding: '0.5rem 1rem', 
                    fontSize: '0.9rem',
                    backgroundColor: 'var(--color-sea-teal)',
                    color: '#ffffff'
                  }}
                >
                  典拠詳細を確認する
                  <Globe size={14} />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
