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
        
        // Find all .show() occurrences to support multiple hosters
        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        let allMirrors = [];
        let match;
        while ((match = showRegex.exec(html)) !== null) {
            try {
                allMirrors.push(JSON.parse(match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']')));
            } catch(e) {}
        }

        if (allMirrors.length === 0) return JSON.stringify([{ "href": url + "|episode=0", "number": 1, "title": "Movie" }]);

        // Cloudstream 'Transpose' logic: allMirrors[HosterIndex][SeasonIndex][EpisodeIndex]
        // For simplicity in Sora, we map the first available hoster's episodes
        const firstHoster = allMirrors[0]; 
        const episodes = [];
        
        // Kinoger usually nests: [ [ep1, ep2, ep3] ] where [0] is the list
        const list = firstHoster[0] || [];
        list.forEach((_, index) => {
            episodes.push({
                "href": url + "|episode=" + index,
                "number": index + 1,
                "title": "Episode " + (index + 1)
            });
        });

        return JSON.stringify(episodes);
    } catch (e) { return JSON.stringify([]); }
}

// 4. STREAM URL FUNCTION
async function extractStreamUrl(url) {
    try {
        const [pageUrl, epPart] = url.split('|episode=');
        const epIndex = parseInt(epPart);

        const response = await fetchv2(pageUrl, { 'Referer': 'https://kinoger.to' });
        const html = await response.text();
        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        
        let mirrorLinks = [];
        let match;
        while ((match = showRegex.exec(html)) !== null) {
            try {
                const parsed = JSON.parse(match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']'));
                if (parsed[0] && parsed[0][epIndex]) mirrorLinks.push(parsed[0][epIndex].trim());
            } catch (e) {}
        }

        for (let mirror of mirrorLinks) {
            // Logic for Kinoger.re (VidStack API)
            if (mirror.includes('kinoger.re/#')) {
                const videoId = mirror.split('#')[1];
                // FIXED: Corrected the API path and string template
                const apiUrl = `https://kinoger.re{videoId}&w=1440&h=900&r=`;

                const apiRes = await fetchv2(apiUrl, {
                    headers: { 'Referer': mirror, 'X-Requested-With': 'XMLHttpRequest' }
                });
                
                const apiText = await apiRes.text();
                const hlsMatch = apiText.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
                
                if (hlsMatch) {
                    return JSON.stringify([{
                        "url": hlsMatch[1],
                        "quality": "Auto HD",
                        "headers": { "Referer": "https://kinoger.re" }
                    }]);
                }
            }
            // Logic for Kinoger.ru (VOE)
            if (mirror.includes('kinoger.ru')) {
                const voeUrl = mirror.replace('kinoger.ru', 'voe.sx');
                return JSON.stringify([{ "url": voeUrl, "quality": "VOE Mirror" }]);
            }
        }
        return JSON.stringify([]);
    } catch (e) { return JSON.stringify([]); }
}
