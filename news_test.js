import { XMLParser } from 'fast-xml-parser';

async function testNews() {
  // Query Google News RSS for okinawatimes.co.jp containing "書評"
  const q = encodeURIComponent('site:okinawatimes.co.jp 書評');
  const url = `https://news.google.com/rss/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`;
  
  console.log(`Fetching Google News: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const xml = await res.text();
    const parser = new XMLParser();
    const jsonObj = parser.parse(xml);
    
    const items = jsonObj.rss?.channel?.item;
    if (!items) {
      console.log('No news items found.');
      return;
    }
    
    const itemList = Array.isArray(items) ? items : [items];
    console.log(`Found ${itemList.length} news items.`);
    
    for (const item of itemList.slice(0, 10)) {
      console.log('---------------------------');
      console.log(`Title: ${item.title}`);
      console.log(`Link: ${item.link}`);
      console.log(`PubDate: ${item.pubDate}`);
      
      // Try to extract book titles in brackets like 『...』
      const matches = item.title.match(/『([^』]+)』/g);
      if (matches) {
        console.log(`Extracted Titles:`, matches.map(m => m.replace(/[『』]/g, '')));
      }
    }
  } catch (error) {
    console.error(`Error:`, error.message);
  }
}

testNews();
