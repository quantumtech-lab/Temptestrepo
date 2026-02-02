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

        // Target the images-border div where you said everything is located
        const metaBlock = html.match(/<div class="images-border"[^>]*>([\s\S]*?)<\/div>/i);
        let description = "No description available";
        let airdate = "Unknown";

        if (metaBlock) {
            let content = metaBlock[1];
            // Remove the S19E01-08 indicator and the image end tags
            content = content.replace(/<b>[\s\S]*?<\/b>/g, "");
            content = content.replace(/<!--[\s\S]*?-->/g, "");
            // Remove the masha_index spans
            content = content.replace(/<span class="masha_index[^>]*>[\s\S]*?<\/span>/g, "");
            
            // Extract the first paragraph as description
            description = content.replace(/<[^>]*>/g, "").split('Sprache:')[0].trim();
            
            // Extract Airdate from the "Erstausstrahlung" line in your HTML
            const dateMatch = content.match(/Erstausstrahlung:\s*([^<]+)/i);
            airdate = dateMatch ? dateMatch[1].trim() : "Unknown";
        }

        // Return as a single JSON object for Sora Async Mode
        return JSON.stringify({
            description: description,
            airdate: airdate,
            aliases: "Kinoger HD+"
        });
    } catch (e) {
        return JSON.stringify({ description: "Error loading details" });
    }
}

// 3. EPISODES FUNCTION
async function extractEpisodes(url) {
    try {
        const response = await fetchv2(url, { 'Referer': BASE_URL + '/', redirect: 'follow' });
        const html = await response.text();
        
        // Image extraction from your HTML (inside images-border)
        const posterMatch = html.match(/<div class="images-border">[\s\S]*?src="([^"]+)"/i);
        const poster = posterMatch ? (posterMatch[1].startsWith('http') ? posterMatch[1] : BASE_URL + posterMatch[1]) : "";

        // Extracting episodes from the pw.show/fsst.show arrays
        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        let match = showRegex.exec(html); 
        
        if (!match) return JSON.stringify([]);

        // Parse the first provider found (usually pw.show)
        let cleanJson = match[1].replace(/'/g, '"').replace(/,\s*\]/g, ']');
        const providerArray = JSON.parse(cleanJson)[0]; // Your HTML is [[ep1, ep2...]]

        const episodes = providerArray.map((_, index) => ({
            number: (index + 1).toString(), // Fixes Episode 0
            href: `${url}|episode=${index}`,
            image: poster // Applies the show's poster to each episode
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
