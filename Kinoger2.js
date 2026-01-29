// 1. SEARCH FUNCTION: This tells the app how to find the movie list
async function search(query) {
    const searchUrl = `https://kinoger.to{encodeURIComponent(query)}&x=0&y=0&submit=submit`;
    const response = await fetch(searchUrl);
    const html = await response.text();
    
    const results = [];
    // Regex targeting the 'titlecontrol' div from your Kotlin code
    const regex = /<div class="titlecontrol">.*?<a href="(.*?)">(.*?)<\/a>/gs;
    let match;
    while ((match = regex.exec(html)) !== null) {
        results.push({
            title: match[2].replace(" Film", "").trim(),
            url: match[1],
            poster: "" // Scrapers often omit posters in initial search for speed
        });
    }
    return results;
}

// 2. GETSOURCE FUNCTION: This finds the actual video links when a title is clicked
async function getSource(url) {
    const response = await fetch(url);
    const html = await response.text();

    const scriptRegex = /<div id="container-video.*?<script>(.*?)<\/script>/gs;
    let match = scriptRegex.exec(html);
    if (!match) return [];

    let rawData = match[1].substring(match[1].indexOf("["), match[1].lastIndexOf("]") + 1);
    const sanitizedJson = rawData.replace(/'/g, '"');

    try {
        const linksTable = JSON.parse(sanitizedJson);
        const flattened = linksTable.flat(2); 
        const finalLinks = [];

        flattened.forEach(link => {
            if (link && link.includes("http")) {
                // Replacing masked domains with real hosters
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
