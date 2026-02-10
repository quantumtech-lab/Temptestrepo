const BASE_URL = 'https://kinoger.to';

// soraFetch wrapper (required for compatibility)
async function soraFetch(url, options = { headers: {}, method: "GET", body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? "GET", options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            console.log("soraFetch error: " + error.message);
            return null;
        }
    }
}

// 1. SEARCH FUNCTION
async function searchResults(keyword) {
    try {
        const searchUrl = `${BASE_URL}/index.php?do=search&subaction=search&titleonly=3&story=${encodeURIComponent(keyword)}&x=0&y=0&submit=submit`;
        const response = await soraFetch(searchUrl, { headers: { 'Referer': BASE_URL + '/' } });
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
    } catch (e) { 
        console.log("Search error: " + e);
        return JSON.stringify([]); 
    }
}

// 2. DETAILS FUNCTION
async function extractDetails(url) {
    try {
        const response = await soraFetch(url, { headers: { 'Referer': BASE_URL + '/' } });
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
    } catch (e) { 
        console.log("Details error: " + e);
        return JSON.stringify([{ "description": "Error loading details" }]); 
    }
}

// 3. EPISODES FUNCTION
async function extractEpisodes(url) {
    try {
        const response = await soraFetch(url, { headers: { 'Referer': BASE_URL + '/' } });
        const html = await response.text();
        
        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        let match = showRegex.exec(html); 
        if (!match) return JSON.stringify([{ "href": url + "|s=0|e=0", "number": 1, "title": "Movie/Full" }]);

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
        console.log("Episodes error: " + e);
        return JSON.stringify([]);
    }
}

// 4. STREAM URL FUNCTION
async function extractStreamUrl(urlData) {
    try {
        const parts = urlData.split('|');
        if (parts.length < 3) return JSON.stringify({ streams: [] });

        const pageUrl = parts[0];
        const sIdx = parseInt(parts[1].split('=')[1]);
        const eIdx = parseInt(parts[2].split('=')[1]);

        const response = await soraFetch(pageUrl, { headers: { 'Referer': 'https://kinoger.to' } });
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

        const streams = [];
        const browserUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

        for (let i = 0; i < mirrorLinks.length; i++) {
            const mirror = mirrorLinks[i];
            try {
                if (mirror.indexOf('strmup.to') !== -1) {
                    const fileCode = mirror.split('/').pop();
                    const ajaxUrl = "https://strmup.to/ajax/stream?filecode=" + fileCode;
                    
                    const ajaxRes = await soraFetch(ajaxUrl, { 
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'Referer': 'https://strmup.to',
                            'User-Agent': browserUA
                        }
                    });
                    const ajaxData = await ajaxRes.json();
                    
                    if (ajaxData && ajaxData.streaming_url) {
                        const masterUrl = ajaxData.streaming_url.replace(/\\/g, "");

                        streams.push({
                            title: "StrmUp",
                            streamUrl: masterUrl,
                            headers: {
                                "Referer": "https://strmup.to",
                                "User-Agent": browserUA,
                                "Origin": "https://strmup.to"
                            }
                        });
                    }
                }
            } catch (err) { 
                console.log("Stream extraction error: " + err);
                continue; 
            }
        }

        return JSON.stringify({ streams: streams });

    } catch (e) {
        console.log("ExtractStreamUrl error: " + e);
        return JSON.stringify({ streams: [] });
    }
}
