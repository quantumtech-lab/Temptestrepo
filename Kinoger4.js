// RENAME: search -> searchResults
async function searchResults(query) {
    try {
        const searchUrl = `https://kinoger.to{encodeURIComponent(query)}&x=0&y=0&submit=submit`;
        
        // Using fetchv2 as per Sora documentation
        const response = await fetchv2(searchUrl);
        const html = typeof response === 'string' ? response : response.body;

        if (!html) return [];

        const results = [];
        // Regex targeting Kinoger's specific layout
        const regex = /<div class="titlecontrol">.*?<a href="([^"]+)">(.*?)<\/a>/g;
        let match;
        
        while ((match = regex.exec(html)) !== null) {
            let foundUrl = match[1];
            if (!foundUrl.startsWith('http')) {
                foundUrl = `https://kinoger.to${foundUrl.startsWith('/') ? '' : '/'}${foundUrl}`;
            }

            // Return objects in the format Sora/Luna expects
            results.push({
                title: match[2].replace(" Film", "").trim(),
                link: foundUrl, // Some versions expect 'link' instead of 'url'
                url: foundUrl,
                poster: "" 
            });
        }
        return results;
    } catch (e) {
        return []; 
    }
}

// Ensure the getSource function remains for when a title is clicked
async function getSource(url) {
    try {
        const response = await fetchv2(url);
        const html = typeof response === 'string' ? response : response.body;

        const scriptRegex = /<div id="container-video.*?<script>(.*?)<\/script>/gs;
        let match = scriptRegex.exec(html);
        if (!match) return [];

        let rawData = match[1].substring(match[1].indexOf("["), match[1].lastIndexOf("]") + 1);
        const sanitizedJson = rawData.replace(/'/g, '"');

        const linksTable = JSON.parse(sanitizedJson);
        const flattened = linksTable.flat(2); 
        const finalLinks = [];

        flattened.forEach(link => {
            if (link && typeof link === 'string' && link.includes("http")) {
                let cleanLink = link
                    .replace("kinoger.ru", "voe.sx")
                    .replace("kinoger.be", "vidhide.com")
                    .replace("kinoger.pw", "vidguard.to");

                finalLinks.push({
                    name: "Mirror",
                    url: cleanLink,
                    type: "hls" 
                });
            }
        });
        return finalLinks;
    } catch (e) {
        return [];
    }
}
