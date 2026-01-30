async function searchResults(keyword) {
    try {
        const searchUrl = `https://kinoger.to/${encodeURIComponent(keyword)}&x=0&y=0&submit=submit`;
        
        // Kinoger.to often checks for Referer and User-Agent to prevent 400 errors
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://kinoger.to'
        };

        const response = await fetchv2(searchUrl, headers);
        const html = await response.text();

        // If the site is blocking the request, the html will be empty or a 400 error page
        if (!html || html.includes("400 Bad Request")) {
            return JSON.stringify([{title: "Site Blocked (400)", image: "", href: ""}]);
        }

        const results = [];
        const regex = /<a href="([^"]+(?:stream|series)[^"]+)">([^<]+)<\/a>/g;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1]; // Index 1 is the URL
            const title = match[2].replace(" Film", "").trim(); // Index 2 is the Text

            if (title.length < 2) continue;

            results.push({
                title: title,
                image: "https://kinoger.tofavicon.ico", 
                href: href.startsWith('http') ? href : `https://kinoger.to${href.startsWith('/') ? '' : '/'}${href}`
            });
        }
        
        return JSON.stringify(results);
    } catch (error) {
        return JSON.stringify([]);
    }
}

// These must exist or Sora will fail to load the module
async function extractDetails(url) { return JSON.stringify([]); }
async function extractEpisodes(url) { return JSON.stringify([{ href: url, number: "1" }]); }
async function extractStreamUrl(url) { return null; }
