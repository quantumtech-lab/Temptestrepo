/**
 * Kinoger.to Sora Extension
 * Based on CloudStream3 Kotlin Source
 */

const BASE_URL = 'https://kinoger.to';

// Helper: Flips Host/Episode matrix to Episode/Host
function transpose(table) {
    if (!table || table.length === 0) return [];
    return table[0].map((_, colIndex) => table.map(row => row[colIndex]));
}

async function searchResults(keyword) {
    try {
        // Updated URL with parameters from your HTML snippet
        const searchUrl = `${BASE_URL}/index.php?do=search&subaction=search&titleonly=3&story=${encodeURIComponent(keyword)}&x=0&y=0&submit=submit`;
        
        const response = await fetchv2(searchUrl, { 'Referer': BASE_URL + '/' });
        const html = await response.text();
        const results = [];

        // Kotlin uses: div#dle-content div.titlecontrol
        const regex = /<div class="titlecontrol">[\s\S]*?<a href="([^"]+)"[^>]*>(.*?)<\/a>/g;
        let match;

        while ((match = regex.exec(html)) !== null) {
            let href = match[1];
            let title = match[2].replace(/<\/?[^>]+(>|$)/g, "").replace(" Film", "").trim();

            // Kotlin 'getProperLink' logic: convert episode links back to series base links
            if (href.includes("-episode-")) {
                const seriesMatch = href.match(/kinoger\.to\/(.+)-ep/);
                if (seriesMatch) href = `${BASE_URL}/series/${seriesMatch[1]}`;
            }

            results.push({
                title: title,
                href: href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`,
                image: "" 
            });
        }
        return JSON.stringify(results);
    } catch (e) { return JSON.stringify([]); }
}

async function load(url) {
    try {
        const response = await fetchv2(url, { 'Referer': BASE_URL + '/' });
        const html = await response.text();

        // 1. Metadata extraction
        const title = (html.match(/<h1 id="news-title">([^<]+)<\/h1>/) || ["", ""])[1].replace(" Film", "").trim();
        const posterMatch = html.match(/<div class="images-border">[\s\S]*?src="([^"]+)"/);
        const poster = posterMatch ? (posterMatch[1].startsWith('http') ? posterMatch[1] : `${BASE_URL}${posterMatch[1]}`) : "";
        const description = (html.match(/<div class="images-border">([\s\S]*?)<\/div>/) || ["", ""])[1]
            .replace(/<[^>]*>/g, "").trim();
        
        const yearMatch = title.match(/\((\d{4})\)/);
        const year = yearMatch ? parseInt(yearMatch[1]) : null;

        // 2. Video Script Extraction (container-video)
        const scriptRegex = /<div id="container-video[^>]*>[\s\S]*?<script[^>]*>([\s\S]*?)<\/script>/g;
        let scriptContents = [];
        let match;
        while ((match = scriptRegex.exec(html)) !== null) {
            scriptContents.push(match[1]);
        }

        // 3. Parse JS Arrays to JSON
        const linksData = scriptContents.map(script => {
            const dataString = script.substring(script.indexOf("[") + 1, script.lastIndexOf("]"));
            try {
                return JSON.parse(`[${dataString.replace(/'/g, '"')}]`);
            } catch (e) { return []; }
        });

        // 4. Double Transpose to align Seasons/Episodes
        // Kotlin: .let { transpose(it) }.map { transpose(it) }
        const transposedLinks = transpose(linksData).map(row => transpose(row));

        // 5. Determine Type (Movie flag "0.2" in DLE)
        const isMovie = scriptContents.some(s => s.includes(",0.2)"));

        const episodes = [];
        transposedLinks.forEach((seasonList, sIdx) => {
            seasonList.forEach((episodeIframes, eIdx) => {
                episodes.push({
                    name: isMovie ? title : `Staffel ${sIdx + 1} - Episode ${eIdx + 1}`,
                    season: sIdx + 1,
                    episode: eIdx + 1,
                    data: JSON.stringify({ links: episodeIframes })
                });
            });
        });

        return JSON.stringify({
            title,
            poster,
            description,
            year,
            type: isMovie ? "movie" : "tv",
            episodes
        });
    } catch (e) { return JSON.stringify({}); }
}

async function loadLinks(data) {
    try {
        const parsed = JSON.parse(data);
        const results = [];
        if (!parsed.links) return JSON.stringify([]);

        for (const link of parsed.links) {
            // Utilizes Sora's internal extractor engine
            const extractorResult = await loadExtractor(link, BASE_URL + "/");
            if (extractorResult) results.push(extractorResult);
        }
        return JSON.stringify(results);
    } catch (e) { return JSON.stringify([]); }
}
