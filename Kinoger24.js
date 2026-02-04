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
        if (parts.length < 3) return "Error: Data split failed";

        const pageUrl = parts[0];
        let sIdx = parseInt((parts[1] || "s=1").split('=')[1]) - 1;
        let eIdx = parseInt((parts[2] || "e=1").split('=')[1]) - 1;

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

        const finalStreams = [];
        const headers = {
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };

        for (let mirror of mirrorLinks) {
            if (mirror.includes('kinoger.re/#')) {
                const videoId = mirror.split('#')[1];
                const mirrorBase = "https://kinoger.re";

                // STEP 1: Pre-flight
                await fetchv2(`${mirrorBase}/api/v1/info?id=${videoId}`, { headers: { ...headers, 'Referer': mirror } });

                // STEP 2: Video API (Returns Base64 Token)
                const videoRes = await fetchv2(`${mirrorBase}/api/v1/video?id=${videoId}&w=1440&h=900&r=`, { headers: { ...headers, 'Referer': mirror } });
                const base64Token = await videoRes.text();

                // DECODE BASE64 to HEX
                let hexToken = "";
                try {
                    // atob is standard in browsers and Sora for decoding base64
                    hexToken = atob(base64Token.trim()).replace(/["']/g, "");
                } catch (e) {
                    hexToken = base64Token.trim().replace(/["']/g, ""); // Fallback if already decoded
                }

                if (hexToken.length > 50) {
                    // STEP 3: Player API using decoded Hex Token
                    const playerRes = await fetchv2(`${mirrorBase}/api/v1/player?t=${hexToken}`, { headers: { ...headers, 'Referer': mirror } });
                    const playerText = await playerRes.text();
                    
                    const hlsMatch = playerText.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
                    if (hlsMatch) {
                        finalStreams.push({
                            title: "Kinoger HD (HLS)",
                            streamUrl: hlsMatch[1].replace(/\\/g, ""),
                            headers: { "Referer": mirrorBase, "Origin": mirrorBase }
                        });
                    }
                }
            }
        }

        if (finalStreams.length === 0) return "Error: Failed to decode stream token.";

        return JSON.stringify({ streams: finalStreams, subtitles: "" });

    } catch (e) {
        return "Global Error: " + e.message;
    }
}
