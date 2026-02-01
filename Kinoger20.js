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

        // 1. Extract Metadata
        const titleMatch = html.match(/<h1[^>]* id="news-title"[^>]*>([\s\S]*?)<\/h1>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").replace(" Film", "").trim() : "Unknown";
        
        const posterMatch = html.match(/class="images-border">[\s\S]*?src="([^"]+)"/i);
        let poster = posterMatch ? posterMatch[1] : "";
        if (poster && !poster.startsWith('http')) poster = `${BASE_URL}${poster}`;

        // 2. Extract Nested Arrays from .show() calls
        // In your HTML: pw.show(1,[['link1','link2'...]])
        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
        let allProviderArrays = [];
        let match;

        while ((match = showRegex.exec(html)) !== null) {
            try {
                // Clean the JS array to be valid JSON (handles single quotes and spaces)
                let cleanJson = match[1]
                    .replace(/'/g, '"') 
                    .replace(/,\s*\]/g, ']') 
                    .trim();
                
                const parsed = JSON.parse(cleanJson);
                if (Array.isArray(parsed)) allProviderArrays.push(parsed);
            } catch (e) {
                // Fallback: If JSON.parse fails, manually extract links
                const manualLinks = match[1].match(/https?:\/\/[^'"]+/g);
                if (manualLinks) allProviderArrays.push([manualLinks]);
            }
        }

        if (allProviderArrays.length === 0) return JSON.stringify({ error: "No episode sources found" });

        // 3. Build Episode List
        // Kinoger puts all episodes for a provider in one sub-array: provider[0][episodeIndex]
        const episodes = [];
        
        // We use the provider with the most links to define the episode count
        const primaryProvider = allProviderArrays.reduce((prev, current) => 
            (prev[0]?.length > current[0]?.length) ? prev : current
        );

        primaryProvider[0].forEach((_, eIdx) => {
            let mirrors = [];
            
            // For each episode, collect links from every available provider (pw, fsst, go, ollhd)
            allProviderArrays.forEach(provider => {
                try {
                    const link = provider[0][eIdx];
                    if (link && link.includes('http')) {
                        mirrors.push(link.trim());
                    }
                } catch (err) {}
            });

            if (mirrors.length > 0) {
                episodes.push({
                    name: `Episode ${eIdx + 1}`,
                    season: 1,
                    episode: eIdx + 1,
                    data: JSON.stringify({ links: mirrors })
                });
            }
        });

        const isMovie = html.includes(",0.2)") || episodes.length === 1;

        return JSON.stringify({
            title,
            poster,
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
