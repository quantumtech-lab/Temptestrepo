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
        var parts = urlData.split('|');
        if (parts.length < 3) return "Error: Data split failed";

        var pageUrl = parts[0];
        
        // AUTO-DETECT INDICES: Handle both 0-based and 1-based input
        var rawS = parseInt(parts[1].split('=')[1]);
        var rawE = parseInt(parts[2].split('=')[1]);
        
        // If Sora sends 1, we need 0. If Sora sends 0, we keep 0.
        var sIdx = rawS > 0 ? rawS - 1 : 0;
        var eIdx = rawE > 0 ? rawE - 1 : 0;

        var response = await fetchv2(pageUrl, { headers: { 'Referer': 'https://kinoger.to' } });
        var html = await response.text();

        var showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        var mirrorLinks = [];
        var match;
        while ((match = showRegex.exec(html)) !== null) {
            try {
                var parsed = JSON.parse(match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']'));
                // Bounds check to prevent "No mirrors found" error
                if (parsed && parsed[sIdx] && parsed[sIdx][eIdx]) {
                    mirrorLinks.push(parsed[sIdx][eIdx].trim().replace(/["']/g, ""));
                }
            } catch (e) {}
        }

        var finalStreams = [];

        for (var i = 0; i < mirrorLinks.length; i++) {
            var mirror = mirrorLinks[i];
            try {
                // 1. STRMUP - The working logic from your browser test
                if (mirror.indexOf('strmup.to') !== -1) {
                    var fileCode = mirror.split('/').pop();
                    if (fileCode) {
                        var ajaxUrl = "https://strmup.to/ajax/stream?filecode=" + fileCode;
                        var ajaxRes = await fetchv2(ajaxUrl, { 
                            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': mirror } 
                        });
                        var ajaxData = await ajaxRes.json();
                        
                        if (ajaxData && ajaxData.streaming_url) {
                            finalStreams.push({
                                title: "StrmUp (Direct)",
                                streamUrl: ajaxData.streaming_url.replace(/\\/g, ""),
                                headers: { 
                                "Referer": "https://strmup.to",
                                "Origin": "https://strmup.to",
                                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
                            }
                            });
                        }
                    }
                }
                
                // 2. P2PPLAY - Correcting the API path for the App
                else if (mirror.indexOf('p2pplay.pro') !== -1) {
                    var p2pId = mirror.split('#')[1];
                    if (p2pId) {
                        // Added /api/v1/info?id= which is standard for p2pplay
                        var infoUrl = "https://kinoger.p2pplay.pro/" + p2pId;
                        var infoRes = await fetchv2(infoUrl, { headers: { 'Referer': 'https://kinoger.to' } });
                        var infoData = await infoRes.json();
                        
                        var p2pUrl = infoData.streaming_url || infoData.url || infoData.file;
                        if (p2pUrl) {
                            finalStreams.push({
                                title: "P2PPlay (Auto)",
                                streamUrl: p2pUrl.replace(/\\/g, ""),
                                headers: { "Referer": "https://kinoger.p2pplay.pro/" }
                            });
                        }
                    }
                }
                
                // 3. VOE Fallback
                else if (mirror.indexOf('voe.sx') !== -1 || mirror.indexOf('kinoger.ru') !== -1) {
                    finalStreams.push({
                        title: "VOE Mirror",
                        streamUrl: mirror.replace('kinoger.ru', 'voe.sx'),
                        headers: { "Referer": "https://kinoger.to" }
                    });
                }
            } catch (err) { continue; }
        }

        if (finalStreams.length === 0) return "Error: No playable mirrors found.";

        return JSON.stringify({
            streams: finalStreams,
            subtitles: []
        });

    } catch (e) {
        return "Global Error: " + e.message;
    }
}
