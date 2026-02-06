const BASE_URL = 'https://kinoger.to';

// 1. SEARCH FUNCTION
async function searchResults(keyword) {
    try {
        const searchUrl = `${BASE_URL}/index.php?do=search&subaction=search&titleonly=3&story=${encodeURIComponent(keyword)}&x=0&y=0&submit=submit`;
        const response = await fetchv2(searchUrl, { headers: { 'Referer': BASE_URL + '/' } });
        const html = await response.text();
        const results = [];

        const blocks = html.split('<div class="titlecontrol">');
        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            const linkMatch = block.match(/<a href="([^"]+)">([\s\S]*?)<\/a>/);
            if (!linkMatch) continue;

            const href = linkMatch[1];
            const title = linkMatch[2].replace(/<\/?[^>]+(>|$)/g, "").replace(" Film", "").trim();
            const imgMatch = block.match(/<div class="content_text[^>]*>[\s\S]*?<img src="([^"]+)"/i);
            const image = imgMatch ? (imgMatch[1].startsWith('http') ? imgMatch[1] : BASE_URL + imgMatch[1]) : "";

            results.push({ 
                title: title, 
                image: image, 
                href: href.startsWith('http') ? href : BASE_URL + href 
            });
        }
        return JSON.stringify(results); // Must be Stringified JSON
    } catch (e) { return JSON.stringify([]); }
}

// 2. DETAILS FUNCTION
async function extractDetails(url) {
    try {
        const response = await fetchv2(url, { 'Referer': BASE_URL + '/', redirect: 'follow' });
        const html = await response.text();
        const descriptionMatch = html.match(/text-align:\s*right;?["'][^>]*>[\s\S]*?<\/div>([\s\S]*?)<br><br>/i);
        
        let description = "German Stream on Kinoger";
        if (descriptionMatch && descriptionMatch[1]) {
            description = descriptionMatch[1].replace(/<[^>]*>/g, "").replace(/[\r\n\t]+/g, " ").trim();
        }

        return JSON.stringify([{
            "description": description.replace(/"/g, "'"),
            "airdate": "Kinoger", 
            "aliases": "HD Stream"
        }]);
    } catch (e) { return JSON.stringify([{ "description": "Error loading details" }]); }
}

// 3. EPISODES FUNCTION
async function extractEpisodes(url) {
    try {
        const response = await fetchv2(url, { 'Referer': BASE_URL + '/' });
        const html = await response.text();
        
        // Find the first available hoster script to build the season structure
        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        let match = showRegex.exec(html); 
        if (!match) return JSON.stringify([{ "href": url + "|s=0|e=0", "number": 1, "title": "Movie/Full" }]);

        // Clean and parse: Result is usually [ [S1E1, S1E2], [S2E1, S2E2] ]
        let rawJson = match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']');
        const seasonData = JSON.parse(rawJson);

        const episodes = [];
        seasonData.forEach((seasonArray, sIdx) => {
            seasonArray.forEach((_, eIdx) => {
                episodes.push({
                    "href": `${url}|s=${sIdx}|e=${eIdx}`,
                    "number": eIdx + 1,
                    "season": sIdx + 1,
                    "title": `S${sIdx + 1} E${eIdx + 1}`
                });
            });
        });

        return JSON.stringify(episodes);
    } catch (e) {
        return JSON.stringify([]);
    }
}

// 4. STREAM URL FUNCTION (Passing headers to the player)
async function extractStreamUrl(urlData) {
    try {
        const parts = urlData.split('|');
        if (parts.length < 3) return null;

        const pageUrl = parts[0];
        const sMatch = urlData.match(/s=(\d+)/);
        const eMatch = urlData.match(/e=(\d+)/);
        const sIdx = sMatch ? parseInt(sMatch[1]) : 0;
        const eIdx = eMatch ? parseInt(eMatch[1]) : 0;

        const response = await fetchv2(pageUrl, { headers: { 'Referer': 'https://kinoger.to' } });
        const html = await response.text();

        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        let mirrorLinks = [];
        let match;
        while ((match = showRegex.exec(html)) !== null) {
            try {
                const parsed = JSON.parse(match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']'));
                if (parsed && parsed[sIdx] && parsed[sIdx][eIdx]) {
                    mirrorLinks.push(parsed[sIdx][eIdx].trim().replace(/["']/g, ""));
                }
            } catch (e) {}
        }

        const mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

        for (const mirror of mirrorLinks) {
            if (mirror.includes('strmup.to')) {
                try {
                    const fileCode = mirror.split('/').pop();
                    const ajaxRes = await fetchv2("https://strmup.to/ajax/stream?filecode=" + fileCode, { 
                        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': mirror, 'User-Agent': mobileUA } 
                    });
                    const ajaxData = await ajaxRes.json();
                    
                    if (ajaxData && ajaxData.streaming_url) {
                        const finalUrl = ajaxData.streaming_url.replace(/\\/g, "");
                        
                        // FIRE-AND-FORGET WARMUP
                        // We fetch the master manifest in the background to initialize the CDN session
                        // without waiting for it to finish (this prevents the 504 timeout)
                        fetchv2(finalUrl, { headers: { 'User-Agent': mobileUA, 'Referer': 'https://strmup.to', 'Connection': 'keep-alive' } });

                        return finalUrl; 
                    }
                } catch (err) { continue; }
            }
        }
        return null;
    } catch (e) { return null; }
}
