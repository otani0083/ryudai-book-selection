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
  Globe
} from 'lucide-react';

export default function App() {
  const [data, setData] = useState({ lastUpdated: null, books: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('okinawa-ja'); // okinawa-ja, okinawa-en, academic
  const [statusFilter, setStatusFilter] = useState('all'); // all, owned, missing
  const [sortBy, setSortBy] = useState('newest'); // newest, title, status
  
  // Modal State
  const [selectedBook, setSelectedBook] = useState(null);

  // Fetch book selection data
  useEffect(() => {
    fetchData();
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

  // Category display names and tab configs
  const tabs = [
    { id: 'okinawa-ja', name: '沖縄・琉球・奄美 (和書)', color: 'okinawa-ja' },
    { id: 'okinawa-en', name: '沖縄・琉球・奄美 (洋書)', color: 'okinawa-en' },
    { id: 'academic', name: '一般学術書 (推薦)', color: 'academic' }
  ];

  // Helper to count items in each category
  const tabCounts = useMemo(() => {
    const counts = { 'okinawa-ja': 0, 'okinawa-en': 0, academic: 0 };
    data.books.forEach(book => {
      if (counts[book.category] !== undefined) {
        counts[book.category]++;
      }
    });
    return counts;
  }, [data.books]);

  // Filter & Search & Sort Logic
  const filteredBooks = useMemo(() => {
    let result = data.books.filter(book => book.category === activeTab);

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
        // Simple string comparison for pubDate (e.g. 2026.06 or 2026-05)
        return String(b.pubDate).localeCompare(String(a.pubDate));
      } else if (sortBy === 'title') {
        return String(a.title).localeCompare(String(b.title), 'ja');
      } else if (sortBy === 'status') {
        return String(a.status).localeCompare(String(b.status), 'ja');
      }
      return 0;
    });

    return result;
  }, [data.books, activeTab, statusFilter, searchQuery, sortBy]);

  // Export to CSV Function
  const exportToCSV = () => {
    if (filteredBooks.length === 0) return;
    
    // Define Headers
    const headers = ['ISBN', 'カテゴリ', 'タイトル', '著者', '出版社', '出版日', '分類(NDC)', '所蔵状況', '配架場所と状態', 'OPAC予約URL(所蔵あり) / 典拠URL(未所蔵)'];
    
    // Build rows
    const rows = filteredBooks.map(book => {
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
      
      return [
        book.isbn,
        categoryName,
        book.title,
        book.author,
        book.publisher,
        book.pubDate,
        book.ndc,
        book.status,
        holdingDetail,
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
    
    // Dynamic filename based on active category and filter
    const dateStr = new Date().toISOString().split('T')[0];
    const categoryLabel = tabs.find(t => t.id === activeTab)?.name.replace(/\s+/g, '') || activeTab;
    const filterLabel = statusFilter === 'all' ? '全所蔵' : statusFilter === 'owned' ? '所蔵のみ' : '未所蔵のみ';
    
    link.setAttribute('download', `琉大選書_${categoryLabel}_${filterLabel}_${dateStr}.csv`);
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

            <div className="filter-group">
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
                disabled={filteredBooks.length === 0}
                style={{ opacity: filteredBooks.length === 0 ? 0.6 : 1 }}
              >
                <FileSpreadsheet size={16} />
                CSV出力 ({filteredBooks.length}件)
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
                  <th>所蔵状況</th>
                  <th>タイトル</th>
                  <th>著者</th>
                  <th>出版社</th>
                  <th>出版年月</th>
                  <th>分類(NDC)</th>
                  <th>アクション</th>
                </tr>
              </thead>
              <tbody>
                {filteredBooks.map((book) => (
                  <tr key={book.isbn} onClick={() => setSelectedBook(book)}>
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
                      {book.ndc || '不明'}
                    </td>
                    <td data-label="アクション" onClick={(e) => e.stopPropagation()}>
                      <div className="table-actions">
                        {book.status === '所蔵あり' ? (
                          <a
                            href={book.reserveurl || `https://opac.lib.u-ryukyu.ac.jp/opc/search?q=${book.isbn}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-table-action btn-table-opac"
                          >
                            OPAC配架
                            <ExternalLink size={12} />
                          </a>
                        ) : book.sourceUrl ? (
                          <a
                            href={book.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-table-action btn-table-source"
                          >
                            典拠を確認
                            <Globe size={12} />
                          </a>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
                    <td>{selectedBook.ndc || '不明'}</td>
                  </tr>
                </tbody>
              </table>

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
