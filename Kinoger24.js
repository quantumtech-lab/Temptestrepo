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
        const [pageUrl, sPart, ePart] = urlData.split('|');
        const sIdx = parseInt(sPart.split('=')[1]);
        const eIdx = parseInt(ePart.split('=')[1]);

        // 1. Fetch the main page to find the .show() scripts
        const response = await fetchv2(pageUrl, { 'Referer': 'https://kinoger.to' });
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

        let results = [];
        for (let mirror of mirrorLinks) {
            // THE FIX: Do not return the # URL. You must call the API to get the .m3u8
            if (mirror.includes('kinoger.re/#')) {
                const videoId = mirror.split('#')[1];
                // Correct Kinoger API path
                const apiUrl = `https://kinoger.re{videoId}&w=1440&h=900&r=`;

                const apiRes = await fetchv2(apiUrl, {
                    headers: { 
                        'Referer': mirror,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                
                const apiData = await apiRes.text();
                // Extract the direct HLS stream link from the API response
                const hlsMatch = apiData.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
                
                if (hlsMatch && hlsMatch[1]) {
                    results.push({
                        "url": hlsMatch[1].replace(/\\/g, ""), // Clean escape slashes
                        "quality": "Kinoger HLS",
                        "headers": { 
                            "Referer": "https://kinoger.re",
                            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
                        }
                    });
                }
            } else if (mirror.includes('voe.sx') || mirror.includes('kinoger.ru')) {
                // VOE links usually need their own extractor logic to get the direct file
                results.push({ "url": mirror.replace('kinoger.ru', 'voe.sx'), "quality": "Mirror: VOE (Requires Extractor)" });
            }
        }

        // 2. Return as a clean stringified array
        return JSON.stringify(results);

    } catch (e) {
        return JSON.stringify([]);
    }
}
