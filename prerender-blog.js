// Node script to pre-render latest Substack posts into blog.html
// Usage: node prerender-blog.js https://YOURNAME.substack.com/feed

const fs = require('fs');
const path = require('path');
const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ text: () => data });
          else reject(new Error('Request failed: ' + res.statusCode));
        });
      })
      .on('error', reject);
  });
}

function parseItems(rssText) {
  const items = [];
  const itemRegex = /<item>[\s\S]*?<\/item>/g;
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
  const linkRegex = /<link>(.*?)<\/link>/;
  const dateRegex = /<pubDate>(.*?)<\/pubDate>/;
  const descRegex = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/;

  const matches = rssText.match(itemRegex) || [];
  for (const block of matches.slice(0, 8)) {
    const title = (block.match(titleRegex)?.[1] || block.match(titleRegex)?.[2] || 'Untitled').trim();
    const link = (block.match(linkRegex)?.[1] || '#').trim();
    const pubDate = block.match(dateRegex)?.[1] || '';
    const descriptionRaw = (block.match(descRegex)?.[1] || block.match(descRegex)?.[2] || '').trim();
    const description = descriptionRaw.replace(/<[^>]*>/g, '').substring(0, 180) + '...';
    const date = new Date(pubDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    items.push({ title, link, description, date });
  }
  return items;
}

function makePostsHTML(items) {
  return (
    '\n                <div class="blog-grid">\n' +
    items
      .map(
        (p) =>
          `                    <div class="blog-post" onclick="window.open('${p.link}', '_blank')">\n` +
          `                        <h3>${p.title}</h3>\n` +
          `                        <p>${p.description}</p>\n` +
          `                        <div class="blog-meta">\n` +
          `                            <span class="blog-date">${p.date}</span>\n` +
          `                            <a href="${p.link}" class="read-more" target="_blank">Read More →</a>\n` +
          `                        </div>\n` +
          `                    </div>\n`
      )
      .join('') +
    '                </div>\n            '
  );
}

function makeItemListSchema(items) {
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: p.link, name: p.title })),
  };
  return `<script type="application/ld+json">${JSON.stringify(itemList)}</script>`;
}

async function main() {
  const rssUrl = process.argv[2] || 'https://silicode.substack.com/feed';
  const blogPath = path.resolve(__dirname, 'blog', 'index.html');
  const html = fs.readFileSync(blogPath, 'utf8');

  const startMarker = '<!-- BLOG_STATIC_START -->';
  const endMarker = '<!-- BLOG_STATIC_END -->';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start === -1 || end === -1) throw new Error('Static markers not found in blog.html');

  const res = await fetch(rssUrl);
  const rssText = await res.text();
  const items = parseItems(rssText);
  const postsHTML = makePostsHTML(items);
  const schema = makeItemListSchema(items.slice(0, 5));

  const before = html.slice(0, start + startMarker.length);
  const after = html.slice(end);
  const newHtml = before + '\n' + postsHTML + '\n' + after.replace('</head>', schema + '\n</head>');

  fs.writeFileSync(blogPath, newHtml, 'utf8');
  console.log('Pre-rendered', items.length, 'posts into blog.html');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


