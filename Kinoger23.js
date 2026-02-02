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

        // Use a simpler regex to avoid empty captures
        const metaMatch = html.match(/class="images-border"[^>]*>([\s\S]*?)<\/div>/i);
        let description = "";
        let airdate = "Unknown";

        if (metaMatch && metaMatch[1]) {
            // Clean the HTML tags and special spans
            let clean = metaMatch[1]
                .replace(/<span class="masha_index[^>]*>[\s\S]*?<\/span>/g, "")
                .replace(/<[^>]*>/g, " ")
                .replace(/[\r\n\t]+/g, " ")
                .trim();
            
            // Extract plot (everything before 'Sprache:')
            description = clean.split('Sprache:')[0].trim();
            
            // Extract airdate
            const dateMatch = clean.match(/Erstausstrahlung:\s*([^ ]+)/i);
            airdate = dateMatch ? dateMatch[1].trim() : "Unknown";
        }

        // WRAP IN ARRAY: The logs confirm Sora is looking for Optional([])
        const result = [{
            "description": description || "No description available",
            "airdate": airdate,
            "aliases": "Kinoger HD+"
        }];

        const jsonOutput = JSON.stringify(result);
        console.log('Returning Details: ' + jsonOutput);
        return jsonOutput;

    } catch (error) {
        console.log('Details Error: ' + error.message);
        return JSON.stringify([{ "description": "Error", "aliases": "", "airdate": "" }]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await fetchv2(url, { 'Referer': BASE_URL + '/', redirect: 'follow' });
        const html = await response.text();
        
        // Match the script arrays from your snippets
        const showRegex = /\.show\(\d+,\s*(\[\[[\s\S]*?\]\])\)/g;
        let match = showRegex.exec(html);
        if (!match) return JSON.stringify([]);

        let rawArray = match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']');
        const data = JSON.parse(rawArray);
        const episodeUrls = data[0]; // Access the inner array of URLs

        const episodes = episodeUrls.map((_, index) => ({
            "number": (index + 1).toString(), // Prevents Episode 0
            "href": `${url}|episode=${index}`,
            "image": "" // You can add poster logic here if needed
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
