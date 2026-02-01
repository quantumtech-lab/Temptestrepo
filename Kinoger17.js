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
        const response = await fetchv2(targetUrl, { 'Referer': BASE_URL + '/' });
        const html = await response.text();

        // 1. Metadata with fallback titles
        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").replace(" Film", "").trim() : "Unknown";

        const posterMatch = html.match(/class="images-border">[\s\S]*?src="([^"]+)"/i);
        let poster = posterMatch ? posterMatch[1] : "";
        if (poster && !poster.startsWith('http')) poster = `${BASE_URL}${poster}`;

        // 2. Robust Script Extraction
        // Instead of regexing the whole div, we target the logic where the array starts
        const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
        let linksData = [];
        let isMovie = false;

        for (const script of scriptBlocks) {
            if (script.includes("container-video") || script.includes("0.2")) {
                if (script.includes(",0.2)")) isMovie = true;

                // Find content between the first [ and the last ]
                const start = script.indexOf("[");
                const end = script.lastIndexOf("]");
                
                if (start !== -1 && end !== -1) {
                    let rawArray = script.substring(start, end + 1);
                    
                    try {
                        // CLEANER: Kinoger uses ' which breaks JSON.parse
                        // We replace ' with " and remove trailing commas
                        let cleanJson = rawArray
                            .replace(/'/g, '"') 
                            .replace(/,\s*]/g, ']') // Remove trailing commas
                            .replace(/,\s*}/g, '}'); 
                        
                        const parsed = JSON.parse(cleanJson);
                        if (Array.isArray(parsed)) linksData.push(parsed);
                    } catch (e) {
                        console.log("Parsing individual script failed, skipping...");
                    }
                }
            }
        }

        if (linksData.length === 0) return JSON.stringify({ error: "No video sources found" });

        // 3. Matrix Transposition (Matches Kotlin Logic)
        const transposedLinks = transpose(linksData).map(row => transpose(row));

        const episodes = [];
        transposedLinks.forEach((seasonList, sIdx) => {
            seasonList.forEach((episodeIframes, eIdx) => {
                // Filter out non-url strings
                const validLinks = episodeIframes.filter(l => typeof l === 'string' && l.includes("http"));
                
                if (validLinks.length > 0) {
                    episodes.push({
                        name: isMovie ? title : `Staffel ${sIdx + 1} - Episode ${eIdx + 1}`,
                        season: sIdx + 1,
                        episode: eIdx + 1,
                        data: JSON.stringify({ links: validLinks })
                    });
                }
            });
        });

        // If after all that we have no episodes, the site structure changed
        if (episodes.length === 0) throw new Error("Source parsing yielded 0 episodes");

        return JSON.stringify({
            title,
            poster,
            type: isMovie ? "movie" : "tv",
            episodes: episodes
        });

    } catch (e) {
        console.error("Load Error:", e.message);
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
