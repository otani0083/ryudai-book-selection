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
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(keyword)}&fields=title,author_name,isbn,publish_year,language,publisher&limit=60`;
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
      ndc: 'Foreign'
    })).filter(b => b.isbn !== null);
  } catch (error) {
    console.error(`Error fetching Open Library: ${error.message}`);
    return [];
  }
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
    
    // If continue = 1, we must poll
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
    
    // Parse results
    const results = {};
    if (data.books) {
      for (const [isbn, libData] of Object.entries(data.books)) {
        const ryukyuData = libData[SYSTEM_ID];
        if (ryukyuData) {
          const status = ryukyuData.status; // OK, Cache, Running, Error
          const libkey = ryukyuData.libkey || {};
          const reserveurl = ryukyuData.reserveurl || '';
          
          // Determine status
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
  
  const booksMap = new Map(); // ISBN -> Book
  
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
      booksMap.set(isbn, {
        isbn,
        title: item.title,
        author: item['dc:creator'] || 'Unknown',
        publisher: item['dc:publisher'] || 'Unknown',
        pubDate: item['dcterms:issued'] || item['dc:date']?.['#text'] || item['dc:date'] || 'Unknown',
        category: 'okinawa-ja',
        ndc: ndc
      });
    }
    await sleep(1000);
  }
  
  // 2. Gather Okinawa Japanese Books (by local publishers)
  console.log('\n--- 2. Okinawa Japanese Books (by local publishers) ---');
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
      
      const ndc = item['dc:subject']?.['#text'] || item['dc:subject'] || 'Unknown';
      booksMap.set(isbn, {
        isbn,
        title: item.title,
        author: item['dc:creator'] || 'Unknown',
        publisher: item['dc:publisher'] || pub,
        pubDate: item['dcterms:issued'] || item['dc:date']?.['#text'] || 'Unknown',
        category: 'okinawa-ja',
        ndc: ndc
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
      // Don't overwrite Japanese books if already added
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
      
      // If book already classified as Okinawa related, keep it in Okinawa category
      if (booksMap.has(isbn)) continue;
      
      const ndc = item['dc:subject']?.['#text'] || item['dc:subject'] || 'Unknown';
      booksMap.set(isbn, {
        isbn,
        title: item.title,
        author: item['dc:creator'] || 'Unknown',
        publisher: item['dc:publisher'] || pub,
        pubDate: item['dcterms:issued'] || item['dc:date']?.['#text'] || 'Unknown',
        category: 'academic',
        ndc: ndc
      });
    }
    await sleep(1000);
  }
  
  const allBooks = Array.from(booksMap.values());
  console.log(`\nTotal gathered books with ISBN: ${allBooks.length}`);
  
  // 5. Query Calil for Ryukyu University holdings
  console.log('\n--- 5. Checking holdings in Calil API ---');
  // Chunk size 10 to be gentle and accurate
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
    
    // Cool down to prevent rate limit
    await sleep(1500);
  }
  
  // 6. Write out JSON data
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
