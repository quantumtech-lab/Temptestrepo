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
        if (parts.length < 3) return JSON.stringify({ streams: [] });

        var pageUrl = parts[0];
        var sIdx = parseInt(parts[1].split('=')[1]) - 1;
        var eIdx = parseInt(parts[2].split('=')[1]) - 1;

        var response = await fetchv2(pageUrl, { headers: { 'Referer': 'https://kinoger.to' } });
        var html = await response.text();

        var showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        var mirrorLinks = [];
        var match;
        while ((match = showRegex.exec(html)) !== null) {
            try {
                var parsed = JSON.parse(match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']'));
                if (parsed && parsed[sIdx] && parsed[sIdx][eIdx]) {
                    mirrorLinks.push(parsed[sIdx][eIdx].trim().replace(/["']/g, ""));
                }
            } catch (e) {}
        }

        var finalStreams = [];
        var browserUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0";

        for (var i = 0; i < mirrorLinks.length; i++) {
            var mirror = mirrorLinks[i];
            try {
                if (mirror.indexOf('strmup.to') !== -1) {
                    var fileCode = mirror.split('/').pop();
                    var ajaxUrl = "https://strmup.to/ajax/stream?filecode=" + fileCode;
                    
                    // 1. MANUAL XHR: Fetch the StrmUp JSON
                    var ajaxRes = await fetchv2(ajaxUrl, { 
                        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': mirror, 'User-Agent': browserUA } 
                    });
                    var ajaxData = await ajaxRes.json();
                    
                    if (ajaxData && ajaxData.streaming_url) {
                        var masterUrl = ajaxData.streaming_url.replace(/\\/g, "");
                        
                        // 2. MANUAL XHR: Fetch the Master Manifest to trigger CDN session
                        var masterRes = await fetchv2(masterUrl, { 
                            headers: { 'Referer': mirror, 'User-Agent': browserUA } 
                        });
                        var masterContent = await masterRes.text();

                        // 3. MANUAL XHR: Extract and fetch Video Index (index_1920x1080.m3u8)
                        var videoIndexMatch = masterContent.match(/index_[^"'\s]+\.m3u8[^"'\s]*/);
                        if (videoIndexMatch) {
                            var baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
                            var videoIndexUrl = baseUrl + videoIndexMatch[0];
                            await fetchv2(videoIndexUrl, { headers: { 'Referer': mirror, 'User-Agent': browserUA } });
                        }

                        // 4. MANUAL XHR: Extract and fetch Audio Index (audio/.../index.m3u8)
                        var audioIndexMatch = masterContent.match(/https?:\/\/[^"'\s]+\/audio\/[^"'\s]+\/index\.m3u8[^"'\s]*/);
                        if (audioIndexMatch) {
                            await fetchv2(audioIndexMatch[0], { headers: { 'Referer': mirror, 'User-Agent': browserUA } });
                        }

                        // Return the Master URL to the player with warmed-up session
                        finalStreams.push({
                            title: "StrmUp Manual (Multi-Track)",
                            streamUrl: masterUrl,
                            headers: { 
                                "Referer": mirror,
                                "Origin": "https://strmup.to",
                                "User-Agent": browserUA,
                                "Connection": "keep-alive"
                            }
                        });
                    }
                }
            } catch (err) { console.log("XHR Sequence Failed: " + err); continue; }
        }

        return JSON.stringify({
            streams: finalStreams,
            subtitles: []
        });

    } catch (e) {
        return JSON.stringify({ streams: [], error: e.message });
    }
}
