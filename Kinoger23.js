const BASE_URL = 'https://kinoger.to';

// 1. SEARCH FUNCTION
async function searchResults(keyword) {
    try {
        const searchUrl = `${BASE_URL}/index.php?do=search&subaction=search&titleonly=3&story=${encodeURIComponent(keyword)}&x=0&y=0&submit=submit`;
        const response = await fetchv2(searchUrl, { 'Referer': BASE_URL + '/' });
        const html = await response.text();
        const results = [];

        // Split by titlecontrol to separate each result entry
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

        // 1. ANCHOR: Look for the closing </div> of the 'text-align:right' container
        // Capture everything after it until the first <br><br>
        const descriptionMatch = html.match(/text-align:\s*right;?["'][^>]*>[\s\S]*?<\/div>([\s\S]*?)<br><br>/i);
        
        let description = "No description available";
        if (descriptionMatch && descriptionMatch[1]) {
            description = descriptionMatch[1]
                .replace(/<span class="masha_index[^>]*>[\s\S]*?<\/span>/g, "") // Remove spans
                .replace(/<[^>]*>/g, "") // Remove any other HTML
                .replace(/[\r\n\t]+/g, " ") // Clean whitespace
                .trim();
        }

        // 2. Return as Array of One Object (For Sora iOS stability)
        const result = [{
            "description": description.replace(/"/g, "'"),
            "airdate": "Kinoger", 
            "aliases": "HD Stream"
        }];

        return JSON.stringify(result);

    } catch (e) {
        return JSON.stringify([{ "description": "Error: " + error.message }]);
    }
}

// 3. EPISODES FUNCTION
async function extractEpisodes(url) {
    try {
        const response = await fetchv2(url, { 'Referer': BASE_URL + '/', redirect: 'follow' });
        const html = await response.text();
        
        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        let match = showRegex.exec(html); 
        if (!match) return JSON.stringify([]);

        let rawArrayString = match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']');
        const providerArray = JSON.parse(rawArrayString);
        const episodeLinks = providerArray[0]; 

        const episodes = episodeLinks.map((_, index) => {
            const displayNum = index + 1;
            return {
                "href": url + "|episode=" + index,
                "number": displayNum,          // Send as Integer
                "title": "Episode " + displayNum // Force the UI label
            };
        });

        console.log("Extracted " + episodes.length + " episodes for UI.");
        return JSON.stringify(episodes);

    } catch (e) {
        console.log("Episodes Logic Error: " + error.message);
        return JSON.stringify([]);
    }
}

// 4. STREAM URL FUNCTION
async function extractStreamUrl(url) {
    try {
        const [pageUrl, epMarker] = url.split('|episode=');
        const epIndex = parseInt(epMarker);

        // 1. Get the Mirror Links from the main page
        const response = await fetchv2(pageUrl, { headers: { 'Referer': 'https://kinoger.to' } });
        const html = await response.text();

        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        let mirrorLinks = [];
        let match;
        while ((match = showRegex.exec(html)) !== null) {
            try {
                let cleanJson = match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']');
                const parsed = JSON.parse(cleanJson);
                if (parsed[epIndex]) mirrorLinks.push(parsed[epIndex].trim());
            } catch (e) {}
        }

        const finalSources = [];

        // 2. Emulate the XHR request you found in your logs
        for (let mirror of mirrorLinks) {
            if (mirror.includes('kinoger.re/#')) {
                const videoId = mirror.split('#')[1];
                // This matches the XHR URL from your log
                const apiUrl = `https://kinoger.re{videoId}&w=1440&h=900&r=`;
                
                console.log('Emulating XHR for ID: ' + videoId);

                const apiRes = await fetchv2(apiUrl, {
                    headers: {
                        'Referer': mirror,
                        'X-Requested-With': 'XMLHttpRequest',
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
                    }
                });

                const apiData = await apiRes.text();
                
                // The API response usually contains the .m3u8 link or a player config
                // We look for the master.m3u8 pattern seen in your log
                const hlsMatch = apiData.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);

                if (hlsMatch) {
                    finalSources.push({
                        "url": hlsMatch[1],
                        "quality": "Auto (HD+)",
                        "headers": {
                            "Referer": "https://kinoger.re",
                            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
                        }
                    });
                }
            }
            
            // 3. Fallback to standard extractor for non-kinoger.re links
            if (finalSources.length === 0) {
                const extracted = await loadExtractor(mirror, pageUrl);
                if (extracted && Array.isArray(extracted)) {
                    extracted.forEach(s => finalSources.push(s));
                }
            }

            if (finalSources.length > 0) break;
        }

        // Final Return for Sora Swift Controller [StreamSource]
        return finalSources.length > 0 ? JSON.stringify(finalSources) : null;

    } catch (e) {
        console.log('API Handshake Error: ' + e.message);
        return null;
    }
}
