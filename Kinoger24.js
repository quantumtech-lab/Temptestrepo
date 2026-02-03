const BASE_URL = 'https://kinoger.to';

// 1. SEARCH FUNCTION
async function searchResults(keyword) {
    try {
        const searchUrl = `${BASE_URL}/index.php?do=search&subaction=search&titleonly=3&story=${encodeURIComponent(keyword)}&x=0&y=0&submit=submit`;
        const response = await fetchv2(searchUrl, { 'Referer': BASE_URL + '/' });
        const html = await response.text();
        const results = [];

        const blocks = html.split('<div class="titlecontrol">');
        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            const linkMatch = block.match(/<a href="([^"]+)">([\s\S]*?)<\/a>/);
            if (!linkMatch) continue;

            let href = linkMatch[1];
            let title = linkMatch[2].replace(/<\/?[^>]+(>|$)/g, "").replace(" Film", "").trim();
            const imgMatch = block.match(/<div class="content_text[^>]*>[\s\S]*?<img src="([^"]+)"/i);
            let image = imgMatch ? (imgMatch[1].startsWith('http') ? imgMatch[1] : BASE_URL + imgMatch[1]) : "";

            results.push({ title, image, href: href.startsWith('http') ? href : BASE_URL + href });
        }
        return JSON.stringify(results);
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

// 4. STREAM URL FUNCTION
async function extractStreamUrl(urlData) {
    try {
        const parts = urlData.split('|');
        const pageUrl = parts[0];
        const sIdx = parseInt(parts[1].split('=')[1]);
        const eIdx = parseInt(parts[2].split('=')[1]);

        const response = await fetchv2(pageUrl, { headers: { 'Referer': 'https://kinoger.to' } });
        const html = await response.text();
        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        
        let mirrorLinks = [];
        let match;
        while ((match = showRegex.exec(html)) !== null) {
            try {
                const parsed = JSON.parse(match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']'));
                if (parsed[sIdx] && parsed[sIdx][eIdx]) {
                    mirrorLinks.push(parsed[sIdx][eIdx].trim().replace(/["']/g, ""));
                }
            } catch (e) {}
        }

        for (let mirror of mirrorLinks) {
            // RESOLVE KINOGER.RE / VIDSTACK
            if (mirror.includes('kinoger.re/#')) {
                const videoId = mirror.split('#')[1];
                const apiUrl = `https://kinoger.re{videoId}&w=1440&h=900&r=`;
                const apiRes = await fetchv2(apiUrl, { headers: { 'Referer': mirror, 'X-Requested-With': 'XMLHttpRequest' } });
                const apiData = await apiRes.text();

                const hlsMatch = apiData.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
                if (hlsMatch) {
                    // RETURN ONLY ONE OBJECT (Sora iOS stability)
                    return JSON.stringify([{
                        "url": hlsMatch[1].replace(/\\/g, ""),
                        "quality": "HD Auto",
                        "headers": { "Referer": "https://kinoger.re" }
                    }]);
                }
            }
            
            // RESOLVE VOE (Directly via URL check)
            if (mirror.includes('voe.sx') || mirror.includes('kinoger.ru')) {
                const voeUrl = mirror.replace('kinoger.ru', 'voe.sx');
                const voeRes = await fetchv2(voeUrl);
                const voeHtml = await voeRes.text();
                const voeFileMatch = voeHtml.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
                
                if (voeFileMatch) {
                    return JSON.stringify([{
                        "url": voeFileMatch[1],
                        "quality": "VOE Mirror"
                    }]);
                }
            }
        }
        return JSON.stringify([]);
    } catch (e) {
        return JSON.stringify([]);
    }
}
