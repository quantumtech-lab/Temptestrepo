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
        const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").replace(" Film", "").trim() : "Unknown Title";

        // 2. Extract arrays from all tabs (pw, fsst, go, ollhd)
        // Regex looks for any .show() call and captures the nested array inside
        const arrayRegex = /\.\s*show\s*\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        let allTabArrays = [];
        let match;

        while ((match = arrayRegex.exec(html)) !== null) {
            try {
                // Convert JS array string (with single quotes) to valid JSON
                // Also trims spaces inside the stringified array
                let jsonString = match[1]
                    .replace(/'/g, '"') 
                    .replace(/,\s*\]/g, ']') // remove trailing commas
                    .replace(/\]\s*,/g, '],');
                
                const parsed = JSON.parse(jsonString);
                if (Array.isArray(parsed)) allTabArrays.push(parsed);
            } catch (e) { 
                console.error("Tab parse error"); 
            }
        }

        if (allTabArrays.length === 0) return JSON.stringify({ error: "No sources found" });

        /**
         * 3. Group by Episode
         * Kinoger mirrors are structured as [Tab][Season][Episode]
         * We want to group all Tabs for each specific Episode
         */
        const episodes = [];
        
        // Use the first tab to determine how many seasons/episodes exist
        // Usually, Kinoger flattens seasons into the main array for display
        const firstTab = allTabArrays[0]; 
        
        firstTab.forEach((seasonArray, sIdx) => {
            seasonArray.forEach((episodeUrl, eIdx) => {
                let mirrors = [];
                
                // Collect the same episode index from every other tab
                allTabArrays.forEach(tab => {
                    try {
                        const link = tab[sIdx][eIdx];
                        if (link && link.includes('http')) {
                            mirrors.push(link.trim());
                        }
                    } catch (err) {}
                });

                if (mirrors.length > 0) {
                    episodes.push({
                        name: `Staffel ${sIdx + 1} - Episode ${eIdx + 1}`,
                        season: sIdx + 1,
                        episode: eIdx + 1,
                        data: JSON.stringify({ links: mirrors })
                    });
                }
            });
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
