/**
 * Kinoger.to Sora Extension
 */

const BASE_URL = 'https://kinoger.to';

// --- HELPER FUNCTIONS ---

function transpose(table) {
    if (!table || table.length === 0) return [];
    return table.map((_, colIndex) => table.map(row => row[colIndex]));
}

function cleanTitle(text) {
    return text ? text.replace(/<\/?[^>]+(>|$)/g, "").replace(" Film", "").trim() : "";
}

// --- MAIN API FUNCTIONS ---

async function searchResults(keyword) {
    try {
        const searchUrl = `${BASE_URL}/index.php?do=search&subaction=search&titleonly=3&story=${encodeURIComponent(keyword)}&x=0&y=0&submit=submit`;
        
        const response = await fetchv2(searchUrl, { 'Referer': BASE_URL + '/' });
        const html = await response.text();
        const results = [];

        /**
         * Logic based on your HTML:
         * 1. The title/link is in <div class="titlecontrol">
         * 2. The image is in the NEXT <div class="general_box"> inside <div class="content_text">
         */
        const blocks = html.split('<div class="titlecontrol">');
        
        // Skip the first split as it's the header
        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            
            // Extract Link and Title
            const linkMatch = block.match(/<a href="([^"]+)">([\s\S]*?)<\/a>/);
            if (!linkMatch) continue;

            let href = linkMatch[1];
            let title = linkMatch[2].replace(/<\/?[^>]+(>|$)/g, "").replace(" Film", "").trim();

            // Extract Image (looking into the associated general_box part)
            // It looks for the first <img> tag inside the content_text area
            const imgMatch = block.match(/<div class="content_text[^>]*>[\s\S]*?<img src="([^"]+)"/i);
            let image = imgMatch ? imgMatch[1] : "";

            // Fix relative paths
            if (image && !image.startsWith('http')) image = `${BASE_URL}${image}`;
            if (href && !href.startsWith('http')) href = `${BASE_URL}${href}`;

            // Clean episode links back to series
            if (href.includes("-episode-")) {
                const seriesMatch = href.match(/kinoger\.to\/(.+)-ep/);
                if (seriesMatch) href = `${BASE_URL}/series/${seriesMatch[1]}`;
            }

            results.push({
                title: title,
                href: href,
                image: image
            });
        }

        return JSON.stringify(results);
    } catch (e) { 
        return JSON.stringify([]); 
    }
}

async function load(url) {
    try {
        const targetUrl = url.startsWith('http') ? url : `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
        const response = await fetchv2(targetUrl, { 
            headers: { 'Referer': BASE_URL + '/' },
            redirect: 'follow' 
        });
        const html = await response.text();

        // 1. Metadata
        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").replace(" Film", "").trim() : "Unknown";

        // 2. THE FIX: Find any nested array containing Kinoger URLs
        // This looks for: [[ 'https://... ', 'https://... ' ]]
        // The [\s\S]*? handles the newlines and spaces found in your HTML snippet
        const universalRegex = /\[\s*\[\s*['"]\s*https?:\/\/kinoger[\s\S]*?\]\s*\]/g;
        let allMirrors = [];
        let arrayMatch;

        while ((arrayMatch = universalRegex.exec(html)) !== null) {
            try {
                // Convert JS array string to valid JSON
                let jsonString = arrayMatch[0]
                    .replace(/'/g, '"') 
                    .replace(/,\s*\]/g, ']') // remove trailing commas
                    .replace(/\]\s*,/g, '],');
                
                const parsed = JSON.parse(jsonString);
                if (Array.isArray(parsed)) allMirrors.push(parsed);
            } catch (e) {
                // If JSON.parse fails, we try a manual string split as fallback
                const manualLinks = arrayMatch[0].match(/https?:\/\/[^'"]+/g);
                if (manualLinks) allMirrors.push([manualLinks]);
            }
        }

        if (allMirrors.length === 0) return JSON.stringify({ error: "No episodes found in source" });

        // 3. Map to Episode Objects
        const episodes = [];
        
        /**
         * Based on your snippet: [['ep1', 'ep2', 'ep3'...]]
         * We take the first successful array found and turn each entry into an episode.
         */
        const firstSet = allMirrors[0][0]; // Get the first inner array
        
        firstSet.forEach((link, index) => {
            const cleanLink = link.trim();
            if (cleanLink.includes("http")) {
                episodes.push({
                    name: `Episode ${index + 1}`,
                    season: 1,
                    episode: index + 1,
                    // Pass the link as the data
                    data: JSON.stringify({ links: [cleanLink] })
                });
            }
        });

        const isMovie = html.includes(",0.2)") || episodes.length === 1;

        return JSON.stringify({
            title,
            type: isMovie ? "movie" : "tv",
            episodes: episodes
        });

    } catch (e) {
        return JSON.stringify({ error: e.message });
    }
}

async function loadLinks(data) {
    try {
        const parsed = JSON.parse(data);
        const results = [];
        if (!parsed.links) return JSON.stringify([]);

        for (const link of parsed.links) {
            // Sends the link to Sora's built-in hoster extractors
            const extractorResult = await loadExtractor(link, BASE_URL + "/");
            if (extractorResult) results.push(extractorResult);
        }
        return JSON.stringify(results);
    } catch (e) { 
        return JSON.stringify([]); 
    }
}
