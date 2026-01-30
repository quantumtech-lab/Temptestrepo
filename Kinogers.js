// 1. SEARCH FUNCTION: Uses fetchv2 to find the movie list
async function search(query) {
    try {
        const searchUrl = `https://kinoger.to{encodeURIComponent(query)}&x=0&y=0&submit=submit`;
        
        // fetchv2 usually returns the text body directly or an object containing it
        const response = await fetchv2(searchUrl);
        const html = typeof response === 'string' ? response : response.body;

        if (!html) return [];

        const results = [];
        const regex = /<div class="titlecontrol">.*?<a href="(.*?)">(.*?)<\/a>/gs;
        let match;
        
        while ((match = regex.exec(html)) !== null) {
            let foundUrl = match[1];
            if (!foundUrl.startsWith('http')) {
                foundUrl = `https://kinoger.to${foundUrl.startsWith('/') ? '' : '/'}${foundUrl}`;
            }

            results.push({
                title: match[2].replace(" Film", "").trim(),
                url: foundUrl,
                poster: "" 
            });
        }
        return results;
    } catch (e) {
        return []; 
    }
}

// 2. GETSOURCE FUNCTION: Uses fetchv2 to find video links
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
