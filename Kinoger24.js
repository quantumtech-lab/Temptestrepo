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
        if (parts.length < 3) return "https://error.org";

        const pageUrl = parts[0];
        const sIdx = parseInt((parts[1] || "s=0").split('=')[1]);
        const eIdx = parseInt((parts[2] || "e=0").split('=')[1]);

        const response = await fetchv2(pageUrl, {
            headers: { 'Referer': 'https://kinoger.to' }
        });
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

        const finalStreams = [];

        for (let mirror of mirrorLinks) {
            if (mirror.includes('kinoger.re/#')) {
                const videoId = mirror.split('#')[1];
                const mirrorBase = "https://kinoger.re";

                // STEP 1: Pre-flight Info (Required to avoid "Invalid URL" / Session block)
                await fetchv2(`${mirrorBase}/api/v1/info?id=${videoId}`, {
                    headers: { 'Referer': mirror, 'X-Requested-With': 'XMLHttpRequest' }
                });

                // STEP 2: Video Handshake (Note the fixed slash before ?id)
                const apiUrl = `${mirrorBase}/api/v1/video?id=${videoId}&w=1440&h=900&r=`;
                const apiRes = await fetchv2(apiUrl, {
                    headers: { 'Referer': mirror, 'X-Requested-With': 'XMLHttpRequest' }
                });
                const apiData = await apiRes.text();

                // STEP 3: Handle player?t= token from your logs
                const tokenMatch = apiData.match(/player\?t=([^"']+)/);
                const directHlsMatch = apiData.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);

                let streamUrl = "";
                if (directHlsMatch) {
                    streamUrl = directHlsMatch[1].replace(/\\/g, "");
                } else if (tokenMatch) {
                    const playerRes = await fetchv2(`${mirrorBase}/api/v1/player?t=${tokenMatch[1]}`, {
                        headers: { 'Referer': mirror }
                    });
                    const playerData = await playerRes.text();
                    const hlsMatch = playerData.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
                    if (hlsMatch) streamUrl = hlsMatch[1].replace(/\\/g, "");
                }

                if (streamUrl) {
                    finalStreams.push({
                        title: "Kinoger HLS",
                        streamUrl: streamUrl,
                        headers: { "Referer": mirrorBase }
                    });
                }
            } else if (mirror.includes('kinoger.ru') || mirror.includes('voe.sx')) {
                finalStreams.push({
                    title: "VOE Mirror",
                    streamUrl: mirror.replace('kinoger.ru', 'voe.sx'),
                    headers: { "Referer": "https://kinoger.to" }
                });
            }
        }

        if (finalStreams.length === 0) return "https://error.org";

        // Final Return Schema to match HiAnime example
        return JSON.stringify({
            streams: finalStreams,
            subtitles: ""
        });

    } catch (e) {
        console.log("Stream Error: " + e.message);
        return "https://error.org";
    }
}
