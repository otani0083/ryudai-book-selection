import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// configuration
const CALIL_API_KEY = process.env.CALIL_API_KEY || '07378fa041f27f67203e208167279ddf';
const SYSTEM_ID = 'Univ_Ryukyu'; // 琉球大学附属図書館
const OUTPUT_DIR = path.join(__dirname, 'public');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'books_data.json');

// local Okinawa publishers list
const okinawaPublishers = [
  'ボーダーインク',
  '沖縄タイムス社',
  '琉球新報社',
  '新星出版',
  '沖縄文化社',
  '榕樹書林',
  'ひるぎ社',
  'むぎ社'
];

// Sleep utility
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Format Date YYYY-MM-DD
function getPastDate(monthsAgo) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Clean and validate ISBN
function cleanISBN(isbnStr) {
  if (!isbnStr) return null;
  const cleaned = String(isbnStr).replace(/[-\s]/g, '').trim();
  if ((cleaned.length === 10 || cleaned.length === 13) && /^\d+x?$/i.test(cleaned)) {
    return cleaned;
  }
  return null;
}

// Extract ISBN from NDL dc:identifier
function extractISBN(identifierField) {
  if (!identifierField) return null;
  const list = Array.isArray(identifierField) ? identifierField : [identifierField];
  
  // Try 13 digit first
  for (const id of list) {
    if (typeof id === 'string') {
      const clean = cleanISBN(id);
      if (clean && clean.length === 13) return clean;
    } else if (id && id['#text']) {
      const type = id['@_xsi:type'] || '';
      if (type.includes('ISBN')) {
        const clean = cleanISBN(id['#text']);
        if (clean && clean.length === 13) return clean;
      }
    }
  }
  
  // Try 10 digit if no 13 digit
  for (const id of list) {
    if (typeof id === 'string') {
      const clean = cleanISBN(id);
      if (clean) return clean;
    } else if (id && id['#text']) {
      const clean = cleanISBN(id['#text']);
      if (clean) return clean;
    }
  }
  
  return null;
}

// Helper to extract nested XML texts (like description or tableOfContents) safely as a string
function extractText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (Array.isArray(field)) {
    return field.map(f => {
      if (typeof f === 'object') {
        return f['#text'] || f.text || JSON.stringify(f);
      }
      return String(f);
    }).join('\n');
  }
  if (typeof field === 'object') {
    return field['#text'] || field.text || JSON.stringify(field);
  }
  return String(field);
}

// Exclude check for books not suitable for university libraries
function isExcludedBook(title, ndc, category) {
  if (!title) return false;
  
  // 1. Exclude workbooks, text preparation, etc. (Keyword check)
  const excludeKeywords = [
    '問題集', '過去問', '参考書', 'ドリル', 'ワークブック', 
    '演習', '試験対策', '検定試験', '学習参考書', '高校入試', 
    '中学入試', '大学入学共通テスト', '赤本', '共通テスト', 
    '教科書ガイド', '英検', 'TOEIC', '資格試験', '模擬試験', 
    '予想問題', '書き込み式', 'かんたん合格'
  ];
  
  if (excludeKeywords.some(kw => title.includes(kw))) {
    console.log(`Excluding workbook/reference book: "${title}"`);
    return true;
  }
  
  // 2. Exclude novels that are NOT Okinawa-related (NDC check for 'academic' category)
  // NDC 913 (Japanese novels), 933 (English novels), etc.
  if (category === 'academic' && ndc) {
    const ndcStr = String(ndc).trim();
    if (/^9\d3/.test(ndcStr) || /^913/.test(ndcStr) || /^933/.test(ndcStr) || /^91/.test(ndcStr)) {
      console.log(`Excluding non-Okinawa novel (NDC ${ndcStr}): "${title}"`);
      return true;
    }
  }
  
  return false;
}

// Strict check to determine if the book is deeply related to Okinawa (theme/subject)
// Prevents books matching solely due to "Okinawa" in TOC or author profile
function isDeeplyOkinawaRelated(item) {
  if (!item) return false;
  
  const title = String(item.title || '').toLowerCase();
  const creator = String(item['dc:creator'] || '').toLowerCase();
  const publisher = String(item['dc:publisher'] || '').toLowerCase();
  
  // 1. Keywords to search in Title/Subtitle (Strong indicators)
  const okinawaKeywords = [
    '沖縄', '琉球', '奄美', '八重山', '宮古', '尖閣', '普天間', '辺野古', 
    '石垣', '西表', '首里', 'ひめゆり', 'okinawa', 'ryukyu', 'amami'
  ];
  if (okinawaKeywords.some(kw => title.includes(kw))) {
    return true;
  }
  
  // 2. Search in Subject (NDL subject headings represent the book's main theme)
  const subjectList = [];
  if (item['dc:subject']) {
    const rawSubjects = Array.isArray(item['dc:subject']) ? item['dc:subject'] : [item['dc:subject']];
    for (const sub of rawSubjects) {
      if (typeof sub === 'string') {
        subjectList.push(sub.toLowerCase());
      } else if (sub && sub['#text']) {
        subjectList.push(String(sub['#text']).toLowerCase());
      }
    }
  }
  if (subjectList.some(sub => okinawaKeywords.some(kw => sub.includes(kw)))) {
    return true;
  }
  
  // 3. Check if published by a local Okinawa publisher
  if (okinawaPublishers.some(pub => publisher.includes(pub))) {
    return true;
  }
  
  // Return false if it just matches "Okinawa" in random fields (like creator biography or TOC)
  return false;
}

// Fetch NDL Search OpenSearch
async function fetchNDL(params) {
  const queryStr = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `https://ndlsearch.ndl.go.jp/api/opensearch?${queryStr}`;
  console.log(`NDL Query: ${url}`);
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`NDL API HTTP error: ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
    const jsonObj = parser.parse(xml);
    const items = jsonObj.rss?.channel?.item;
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
  } catch (error) {
    console.error(`Error fetching NDL: ${error.message}`);
    return [];
  }
}

// Fetch Open Library (for English books on Okinawa/Ryukyu/Amami)
async function fetchOpenLibrary(keyword) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(keyword)}&fields=title,author_name,isbn,publish_year,language,publisher,key&limit=60`;
  console.log(`OpenLibrary Query: ${url}`);
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`OpenLibrary API HTTP error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const docs = data.docs || [];
    
    // Filter English docs with ISBN, published recently (since 2020)
    const filtered = docs.filter(doc => {
      const hasIsbn = doc.isbn && doc.isbn.length > 0;
      const isEnglish = doc.language?.includes('eng');
      const maxYear = doc.publish_year ? Math.max(...doc.publish_year) : 0;
      const isRecent = maxYear >= 2020;
      return hasIsbn && isEnglish && isRecent;
    });
    
    return filtered.map(doc => ({
      isbn: cleanISBN(doc.isbn[0]),
      title: doc.title,
      author: doc.author_name?.join(', ') || 'Unknown',
      publisher: doc.publisher?.join(', ') || 'Unknown',
      pubDate: doc.publish_year ? String(Math.max(...doc.publish_year)) : 'Unknown',
      category: 'okinawa-en',
      ndc: 'Foreign',
      description: 'Open Library metadata (English Edition).',
      toc: 'Table of contents not available for this English book.',
      sourceUrl: doc.key ? `https://openlibrary.org${doc.key}` : 'https://openlibrary.org'
    })).filter(b => b.isbn !== null);
  } catch (error) {
    console.error(`Error fetching Open Library: ${error.message}`);
    return [];
  }
}

// Fetch book info from okinawa newspapers via Google News RSS
async function fetchLocalNewspaperBooks() {
  console.log('\n--- Fetching book information from local newspaper reviews ---');
  const sources = [
    { name: '沖縄タイムス書評', query: 'site:okinawatimes.co.jp 書評' },
    { name: '琉球新報書評', query: 'site:ryukyushimpo.jp 書評' }
  ];
  
  const extractedTitles = new Set();
  const books = [];
  
  const parser = new XMLParser();
  
  for (const source of sources) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(source.query)}&hl=ja&gl=JP&ceid=JP:ja`;
    console.log(`Google News query: ${url}`);
    
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`Google News HTTP error: ${res.status}`);
        continue;
      }
      const xml = await res.text();
      const jsonObj = parser.parse(xml);
      const items = jsonObj.rss?.channel?.item;
      if (!items) continue;
      
      const itemList = Array.isArray(items) ? items : [items];
      for (const item of itemList) {
        // Extract bracketed titles 『...』 and 「...」
        const matches1 = item.title.match(/『([^』]+)』/g) || [];
        const matches2 = item.title.match(/「([^」]+)」/g) || [];
        const matches = [...matches1, ...matches2];
        
        for (const m of matches) {
          const title = m.replace(/[『』「」]/g, '').trim();
          if (title.length > 2 && !title.includes('社説') && !title.includes('コラム') && !title.includes('オピニオン')) {
            extractedTitles.add(title);
          }
        }
      }
    } catch (err) {
      console.error(`Error parsing newspaper feed: ${err.message}`);
    }
    await sleep(1000);
  }
  
  console.log(`Extracted ${extractedTitles.size} unique book titles from newspaper reviews.`);
  
  const titleList = Array.from(extractedTitles).slice(0, 15);
  console.log(`Searching NDL Search for top ${titleList.length} titles...`);
  
  for (const title of titleList) {
    try {
      console.log(`NDL Lookup for news book: "${title}"`);
      const items = await fetchNDL({
        title: title,
        mediatype: 'books',
        cnt: 3
      });
      
      for (const item of items) {
        const isbn = extractISBN(item['dc:identifier']);
        if (!isbn) continue;
        
        const ndc = item['dc:subject']?.['#text'] || item['dc:subject'] || 'Unknown';
        const publisher = item['dc:publisher'] || 'Unknown';
        
        // Dynamically classify book based on deep relation to Okinawa
        const category = isDeeplyOkinawaRelated(item) ? 'okinawa-ja' : 'academic';
        
        books.push({
          isbn,
          title: item.title,
          author: item['dc:creator'] || 'Unknown',
          publisher: publisher,
          pubDate: item['dcterms:issued'] || item['dc:date']?.['#text'] || 'Unknown',
          category: category,
          ndc: ndc,
          description: extractText(item.description),
          toc: extractText(item['dcndl:tableOfContents']),
          sourceUrl: item.link || `https://ndlsearch.ndl.go.jp/books/${item.guid?.['#text'] || ''}`
        });
        
        console.log(`Successfully identified book: "${item.title}" (ISBN: ${isbn}) -> Category: ${category}`);
        break; // Only take the first matching book
      }
    } catch (err) {
      console.error(`Error looking up NDL for "${title}": ${err.message}`);
    }
    await sleep(1000);
  }
  
  return books;
}

// Query Calil API for library holdings
async function checkCalilHoldings(isbnList) {
  if (isbnList.length === 0) return {};
  
  const isbns = isbnList.join(',');
  const baseUrl = `https://api.calil.jp/check?appkey=${CALIL_API_KEY}&systemid=${SYSTEM_ID}&isbn=${isbns}&format=json`;
  
  let url = baseUrl;
  let attempts = 0;
  const maxAttempts = 6;
  
  console.log(`Calil initial check for ${isbnList.length} ISBNs...`);
  
  try {
    let res = await fetch(url);
    if (!res.ok) {
      console.error(`Calil API HTTP error: ${res.status}`);
      return {};
    }
    const text = await res.text();
    const cleanJSON = (str) => {
      const match = str.match(/^callback\((.*)\);?$/s);
      return match ? JSON.parse(match[1]) : JSON.parse(str);
    };
    let data = cleanJSON(text);
    
    while (data.continue === 1 && attempts < maxAttempts) {
      attempts++;
      const waitTime = 3000;
      console.log(`Calil search running. Polling in ${waitTime/1000}s (Attempt ${attempts}/${maxAttempts})...`);
      await sleep(waitTime);
      
      const sessionUrl = `https://api.calil.jp/check?appkey=${CALIL_API_KEY}&session=${data.session}&format=json`;
      res = await fetch(sessionUrl);
      if (!res.ok) {
        console.error(`Calil API Poll HTTP error: ${res.status}`);
        break;
      }
      const pollText = await res.text();
      data = cleanJSON(pollText);
    }
    
    const results = {};
    if (data.books) {
      for (const [isbn, libData] of Object.entries(data.books)) {
        const ryukyuData = libData[SYSTEM_ID];
        if (ryukyuData) {
          const status = ryukyuData.status;
          const libkey = ryukyuData.libkey || {};
          const reserveurl = ryukyuData.reserveurl || '';
          
          let holdingStatus = '未所蔵';
          const hasKeys = Object.keys(libkey).length > 0;
          
          if (status === 'OK' || status === 'Cache') {
            holdingStatus = hasKeys ? '所蔵あり' : '未所蔵';
          } else if (status === 'Running') {
            holdingStatus = '調査中';
          } else {
            holdingStatus = 'エラー';
          }
          
          results[isbn] = {
            status: holdingStatus,
            libkey: libkey,
            reserveurl: reserveurl
          };
        }
      }
    }
    return results;
  } catch (error) {
    console.error(`Error checking Calil: ${error.message}`);
    return {};
  }
}

async function main() {
  console.log('=== START CRAWLING BOOK INFORMATION ===');
  const fromDate = getPastDate(3); // 3 months ago
  console.log(`Target publish date from: ${fromDate}`);
  
  const booksMap = new Map();
  
  // 1. Gather Okinawa Japanese Books (by Keyword)
  console.log('\n--- 1. Okinawa Japanese Books (by Keyword) ---');
  const keywords = ['沖縄', '琉球', '奄美'];
  for (const kw of keywords) {
    const items = await fetchNDL({
      any: kw,
      mediatype: 'books',
      from: fromDate,
      cnt: 100
    });
    console.log(`Found ${items.length} items for keyword "${kw}"`);
    for (const item of items) {
      const isbn = extractISBN(item['dc:identifier']);
      if (!isbn) continue;
      
      const ndc = item['dc:subject']?.['#text'] || item['dc:subject'] || 'Unknown';
      
      // Exclude check
      if (isExcludedBook(item.title, ndc, 'okinawa-ja')) continue;
      
      // Strict filter: must be deeply related to Okinawa
      if (!isDeeplyOkinawaRelated(item)) {
        console.log(`Skipping weakly related Okinawa book: "${item.title}"`);
        continue;
      }
      
      booksMap.set(isbn, {
        isbn,
        title: item.title,
        author: item['dc:creator'] || 'Unknown',
        publisher: item['dc:publisher'] || 'Unknown',
        pubDate: item['dcterms:issued'] || item['dc:date']?.['#text'] || item['dc:date'] || 'Unknown',
        category: 'okinawa-ja',
        ndc: ndc,
        description: extractText(item.description),
        toc: extractText(item['dcndl:tableOfContents']),
        sourceUrl: item.link || `https://ndlsearch.ndl.go.jp/books/${item.guid?.['#text'] || ''}`
      });
    }
    await sleep(1000);
  }
  
  // 2. Gather Okinawa Japanese Books (by local publishers)
  console.log('\n--- 2. Okinawa Japanese Books (by local publishers) ---');
  for (const pub of okinawaPublishers) {
    const items = await fetchNDL({
      publisher: pub,
      mediatype: 'books',
      from: fromDate,
      cnt: 50
    });
    console.log(`Found ${items.length} items for publisher "${pub}"`);
    for (const item of items) {
      const isbn = extractISBN(item['dc:identifier']);
      if (!isbn) continue;
      
      // AVOID BUG: Tokyo's mainstream publisher "新星出版社" matches query "新星出版"
      const rawPublisher = item['dc:publisher'] || 'Unknown';
      if (pub === '新星出版' && String(rawPublisher).includes('新星出版社')) {
        console.log(`Skipping non-Okinawa publisher match (got "${rawPublisher}" for query "${pub}")`);
        continue;
      }
      
      const ndc = item['dc:subject']?.['#text'] || item['dc:subject'] || 'Unknown';
      
      // Exclude check
      if (isExcludedBook(item.title, ndc, 'okinawa-ja')) continue;
      
      booksMap.set(isbn, {
        isbn,
        title: item.title,
        author: item['dc:creator'] || 'Unknown',
        publisher: rawPublisher,
        pubDate: item['dcterms:issued'] || item['dc:date']?.['#text'] || 'Unknown',
        category: 'okinawa-ja',
        ndc: ndc,
        description: extractText(item.description),
        toc: extractText(item['dcndl:tableOfContents']),
        sourceUrl: item.link || `https://ndlsearch.ndl.go.jp/books/${item.guid?.['#text'] || ''}`
      });
    }
    await sleep(1000);
  }
  
  // 3. Gather Okinawa English Books
  console.log('\n--- 3. Okinawa English Books ---');
  const engKeywords = ['Okinawa', 'Ryukyu', 'Amami'];
  for (const kw of engKeywords) {
    const oLibBooks = await fetchOpenLibrary(kw);
    console.log(`Found ${oLibBooks.length} English books with ISBN for keyword "${kw}"`);
    for (const b of oLibBooks) {
      if (isExcludedBook(b.title, b.ndc, 'okinawa-en')) continue;
      if (!booksMap.has(b.isbn)) {
        booksMap.set(b.isbn, b);
      }
    }
    await sleep(1000);
  }
  
  // 4. Gather Academic Books
  console.log('\n--- 4. Academic Books ---');
  const academicPublishers = [
    '東京大学出版会',
    '京都大学出版会',
    '名古屋大学出版会',
    '慶應義塾大学出版会',
    '法政大学出版局',
    '岩波書店',
    '有斐閣',
    '吉川弘文館',
    'みすず書房',
    'ミネルヴァ書房',
    '勁草書房',
    '丸善出版',
    '朝倉書店',
    '共立出版'
  ];
  for (const pub of academicPublishers) {
    const items = await fetchNDL({
      publisher: pub,
      mediatype: 'books',
      from: fromDate,
      cnt: 30
    });
    console.log(`Found ${items.length} items for Academic publisher "${pub}"`);
    for (const item of items) {
      const isbn = extractISBN(item['dc:identifier']);
      if (!isbn) continue;
      if (booksMap.has(isbn)) continue;
      
      const ndc = item['dc:subject']?.['#text'] || item['dc:subject'] || 'Unknown';
      if (isExcludedBook(item.title, ndc, 'academic')) continue;
      
      booksMap.set(isbn, {
        isbn,
        title: item.title,
        author: item['dc:creator'] || 'Unknown',
        publisher: item['dc:publisher'] || pub,
        pubDate: item['dcterms:issued'] || item['dc:date']?.['#text'] || 'Unknown',
        category: 'academic',
        ndc: ndc,
        description: extractText(item.description),
        toc: extractText(item['dcndl:tableOfContents']),
        sourceUrl: item.link || `https://ndlsearch.ndl.go.jp/books/${item.guid?.['#text'] || ''}`
      });
    }
    await sleep(1000);
  }
  
  // 5. Gather Books from Newspaper Reviews
  const newsBooks = await fetchLocalNewspaperBooks();
  console.log(`Found ${newsBooks.length} books in newspaper reviews.`);
  for (const b of newsBooks) {
    if (isExcludedBook(b.title, b.ndc, b.category)) continue;
    if (!booksMap.has(b.isbn)) {
      console.log(`Adding new book from news review: "${b.title}" -> Category: ${b.category}`);
      booksMap.set(b.isbn, b);
    }
  }
  
  const allBooks = Array.from(booksMap.values());
  console.log(`\nTotal gathered books (after filters): ${allBooks.length}`);
  
  // 6. Query Calil for Ryukyu University holdings
  console.log('\n--- 6. Checking holdings in Calil API ---');
  const chunkSize = 10;
  const booksWithHoldings = [];
  
  for (let i = 0; i < allBooks.length; i += chunkSize) {
    const chunk = allBooks.slice(i, i + chunkSize);
    const chunkIsbns = chunk.map(b => b.isbn);
    
    console.log(`\nProcessing chunk ${Math.floor(i / chunkSize) + 1} / ${Math.ceil(allBooks.length / chunkSize)}...`);
    const holdings = await checkCalilHoldings(chunkIsbns);
    
    for (const book of chunk) {
      const holding = holdings[book.isbn];
      if (holding) {
        book.status = holding.status;
        book.libkey = holding.libkey;
        book.reserveurl = holding.reserveurl;
      } else {
        book.status = '調査中';
        book.libkey = {};
        book.reserveurl = '';
      }
      booksWithHoldings.push(book);
    }
    await sleep(1500);
  }
  
  // 7. Write out JSON data
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const outputData = {
    lastUpdated: new Date().toISOString(),
    books: booksWithHoldings
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`\nSuccessfully wrote ${booksWithHoldings.length} books to ${OUTPUT_FILE}`);
  console.log('=== CRAWLING COMPLETED ===');
}

main().catch(err => {
  console.error('Fatal crawler error:', err);
  process.exit(1);
});
