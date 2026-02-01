const mainUrl = "https://kinoger.to";

/**
 * Transposes nested arrays to align Season/Episode/Link data
 * Ported from the Kotlin: transpose(it)
 */
function transpose(table) {
    if (!table || table.length === 0) return [];
    return table[0].map((_, colIndex) => table.map(row => row[colIndex]));
}

async function searchResults(keyword) {
    try {
        // Kotlin uses GET for search with specific subaction params
        const url = `${mainUrl}/?do=search&subaction=search&titleonly=3&story=${encodeURIComponent(keyword)}&x=0&y=0&submit=submit`;
        const response = await fetch(proxyPrefix + encodeURIComponent(url));
        const html = await response.text();

        const results = [];
        // Matches the Kotlin selector: div#dle-content div.titlecontrol
        const regex = /<div class="titlecontrol">[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>/g;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[2].replace(" Film", "").trim(),
                href: match[1],
                image: "" // Posters on Kinoger require additional lazy-load parsing
            });
        }
        return JSON.stringify(results);
    } catch (e) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetch(proxyPrefix + encodeURIComponent(url));
        const html = await response.text();

        const descMatch = html.match(/<div class="images-border">([\s\S]*?)<\/div>/);
        const yearMatch = html.match(/\((\d{4})\)/);

        return JSON.stringify([{
            description: descMatch ? descMatch[1].replace(/<[^>]*>/g, '').trim() : "No description available",
            airdate: yearMatch ? yearMatch[1] : "N/A",
            aliases: "Language: German"
        }]);
    } catch (e) { return JSON.stringify([]); }
}

async function extractEpisodes(url) {
    try {
        const response = await fetch(proxyPrefix + encodeURIComponent(url));
        const html = await response.text();
        
        // Find the video container scripts mentioned in Kotlin code
        const scriptRegex = /<div id="container-video-\d+">[\s\S]*?<script>([\s\S]*?)<\/script>/g;
        let scripts = [];
        let match;
        while ((match = scriptRegex.exec(html)) !== null) {
            scripts.push(match[1]);
        }

        if (scripts.length === 0) return JSON.stringify([]);

        // Parse the nested link structure [[['link1','link2']]]
        // Note: Replacing single quotes with double quotes for JSON compliance
        const allData = scripts.map(script => {
            const dataStr = script.substring(script.indexOf("["), script.lastIndexOf("]") + 1).replace(/'/g, '"');
            try { return JSON.parse(dataStr); } catch(e) { return []; }
        });

        // Reorganize using transpose (as seen in Cloudstream source)
        const transposed = transpose(allData);
        const episodes = [];

        transposed.forEach((seasonData, sIdx) => {
            seasonData.forEach((episodeLinks, eIdx) => {
                // Sora expects a stringified array of links in 'href' for extractStreamUrl to handle
                episodes.push({
                    name: `Season ${sIdx + 1} Episode ${eIdx + 1}`,
                    number: eIdx + 1,
                    href: JSON.stringify(episodeLinks) 
                });
            });
        });

        return JSON.stringify(episodes);
    } catch (e) { return JSON.stringify([]); }
}

async function extractStreamUrl(urlData) {
    try {
        // urlData is the stringified list of hoster links from extractEpisodes
        const links = JSON.parse(urlData);
        
        // We prioritize the domains from your provided Extractor list
        const streamLinks = links.map(link => {
            let direct = link;
            if (link.includes("kinoger.ru")) direct = link.replace("kinoger.ru", "voe.sx");
            if (link.includes("kinoger.be")) direct = link.replace("kinoger.be", "vidhidepro.com");
            if (link.includes("kinoger.pw")) direct = link.replace("kinoger.pw", "vidguard.to");
            if (link.includes("kinoger.re") || link.includes("p2pplay.pro")) direct = link; // VidStack/HLS
            
            return {
                name: "Kinoger Multi",
                url: direct,
                quality: "Unknown"
            };
        });

        return JSON.stringify(streamLinks);
    } catch (e) { return JSON.stringify([]); }
}
