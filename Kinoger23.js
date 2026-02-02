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

        const metaBlock = html.match(/<div class="images-border"[^>]*>([\s\S]*?)<\/div>/i);
        let description = "No description available";
        let airdate = "Unknown";

        if (metaBlock && metaBlock[1]) {
            let content = metaBlock[1]
                .replace(/<span class="masha_index[^>]*>[\s\S]*?<\/span>/g, "")
                .replace(/<!--[\s\S]*?-->/g, "");
            
            // Clean the text and remove problematic characters like \n or \r
            let cleanText = content.replace(/<[^>]*>/g, " ").replace(/[\r\n\t]+/g, " ").trim();
            
            description = cleanText.split('Sprache:')[0].trim();
            
            const dateMatch = cleanText.match(/Erstausstrahlung:\s*([^ ]+)/i);
            airdate = dateMatch ? dateMatch[1].trim() : "Unknown";
        }

        // Return a single object (per Sora Docs) but ensure string safety
        const result = {
            description: description.replace(/"/g, '\\"'), // Escape quotes
            airdate: airdate,
            aliases: "Kinoger HD+"
        };

        return JSON.stringify(result);
    } catch (e) {
        return JSON.stringify({ description: "Error" });
    }
}

// 3. EPISODES FUNCTION
async function extractEpisodes(url) {
    try {
        const response = await fetchv2(url, { 'Referer': BASE_URL + '/', redirect: 'follow' });
        const html = await response.text();
        
        const posterMatch = html.match(/class="images-border">[\s\S]*?src="([^"]+)"/i);
        const poster = posterMatch ? (posterMatch[1].startsWith('http') ? posterMatch[1] : BASE_URL + posterMatch[1]) : "";

        // Specifically targeting the nested arrays in your HTML
        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        let match = showRegex.exec(html); 
        
        if (!match || !match[1]) return JSON.stringify([]);

        // Clean the JS array string so JSON.parse won't crash
        let rawArrayString = match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']');
        const providerArray = JSON.parse(rawArrayString);
        
        // Your HTML structure is [[ep1, ep2...]] so we use [0]
        const episodeList = providerArray[0];

        const episodes = episodeList.map((_, index) => ({
            number: (index + 1).toString(),
            href: `${url}|episode=${index}`,
            image: poster 
        }));

        return JSON.stringify(episodes);
    } catch (e) {
        return JSON.stringify([]);
    }
}

// 4. STREAM URL FUNCTION
async function extractStreamUrl(url) {
    try {
        const [pageUrl, epMarker] = url.split('|episode=');
        const epIndex = parseInt(epMarker);

        const response = await fetchv2(pageUrl, { 'Referer': BASE_URL + '/', redirect: 'follow' });
        const html = await response.text();

        // Find all show arrays again to get the specific mirror for this episode
        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        let mirrors = [];
        let match;

        while ((match = showRegex.exec(html)) !== null) {
            try {
                const cleanJson = match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']');
                const parsed = JSON.parse(cleanJson);
                const link = parsed[0][epIndex]; // Get current episode from current provider
                if (link) mirrors.push(link.trim());
            } catch (e) {}
        }

        // Return the first mirror found (usually pw.show / Stream HD+)
        // You can add logic here to pick a specific hoster like Strmup
        return mirrors.length > 0 ? mirrors[0] : null;
    } catch (e) { return null; }
}
