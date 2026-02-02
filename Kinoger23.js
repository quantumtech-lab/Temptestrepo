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
        return JSON.stringify([{ "description": "Error: " + e.message }]);
    }
}

// 3. EPISODES FUNCTION
async function extractEpisodes(url) {
    try {
        const response = await fetchv2(url, { 'Referer': BASE_URL + '/', redirect: 'follow' });
        const html = await response.text();
        
        // 1. Extract the main poster once
        const posterMatch = html.match(/class="images-border">[\s\S]*?src="([^"]+)"/i);
        const posterUrl = posterMatch ? (posterMatch.startsWith('http') ? posterMatch : BASE_URL + posterMatch) : "";

        // 2. Extract episodes from your HTML snippet's .show() calls
        const showRegex = /\.show\(\s*\d+,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        let match = showRegex.exec(html); 
        
        if (!match) return JSON.stringify([]);

        // Get the inner array of URLs from the first provider
        const rawArray = match.replace(/'/g, '"').replace(/,\s*\]/g, ']');
        const episodeUrls = JSON.parse(rawArray);

        // 3. Map to episodes with correct numbering and image
        const episodes = episodeUrls.map((_, index) => ({
            "number": (index + 1).toString(), // FIX: Starts numbers from 1, not 0
            "name": `Episode ${index + 1}`,   // FIX: Adds a title
            "href": `${url}|episode=${index}`, // Pass original URL + index marker
            "image": posterUrl                // FIX: Add the show poster here
        }));
        
        console.log('Returning episodes list');
        return JSON.stringify(episodes);

    } catch (e) {
        console.log('Episodes Error: ' + e.message);
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
