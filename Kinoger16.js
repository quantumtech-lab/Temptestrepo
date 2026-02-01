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

        // 1. Extraction with fallback checks
        const titleMatch = html.match(/<h1[^>]*id="news-title"[^>]*>([\s\S]*?)<\/h1>/i);
        const title = titleMatch ? cleanTitle(titleMatch[1]) : "Unknown Title";

        const posterMatch = html.match(/class="images-border">[\s\S]*?src="([^"]+)"/i);
        let poster = posterMatch ? posterMatch[1] : "";
        if (poster && !poster.startsWith('http')) poster = `${BASE_URL}${poster}`;

        const descMatch = html.match(/<div class="images-border">([\s\S]*?)<\/div>/i);
        const description = descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "";

        // 2. Video Script parsing
        const containerRegex = /<div id="container-video[^>]*>([\s\S]*?)<\/script>/gi;
        let scriptContents = [];
        let containerMatch;

        while ((containerMatch = containerRegex.exec(html)) !== null) {
            const scriptPart = containerMatch[1].match(/<script[^>]*>([\s\S]*?)$/i);
            if (scriptPart && scriptPart[1]) scriptContents.push(scriptPart[1]);
        }

        if (scriptContents.length === 0) return JSON.stringify({ error: "No sources found" });

        const linksData = scriptContents.map(script => {
            const start = script.indexOf("[");
            const end = script.lastIndexOf("]");
            if (start === -1 || end === -1) return [];
            try {
                // Convert JS array to valid JSON
                return JSON.parse(`[${script.substring(start + 1, end).replace(/'/g, '"')}]`);
            } catch (e) { return []; }
        });

        // 3. Transform to Season/Episode structure
        const transposedLinks = transpose(linksData).map(row => transpose(row));
        const isMovie = scriptContents.some(s => s.includes(",0.2)"));

        const episodes = [];
        transposedLinks.forEach((seasonList, sIdx) => {
            seasonList.forEach((episodeIframes, eIdx) => {
                const validLinks = episodeIframes.filter(l => l && l.length > 5);
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

        return JSON.stringify({
            title,
            poster,
            description,
            type: isMovie ? "movie" : "tv",
            episodes
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
