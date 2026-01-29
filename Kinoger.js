// This function is called when you search or click a title
async function getSource(url) {
    const response = await fetch(url);
    const html = await response.text();

    // 1. Replicating the Cloudstream 'container-video' script extraction
    const scriptRegex = /<div id="container-video.*?<script>(.*?)<\/script>/gs;
    let match = scriptRegex.exec(html);

    if (!match) return [];

    // 2. Extract the JS Array data
    let rawData = match[1].substring(match[1].indexOf("["), match[1].lastIndexOf("]") + 1);
    
    // Clean single quotes for JSON parsing as done in Cloudstream
    const sanitizedJson = rawData.replace(/'/g, '"');

    try {
        const linksTable = JSON.parse(sanitizedJson);
        const finalLinks = [];

        // 3. Transpose/Flatten logic
        // Kinoger structure is often [Season][Episode][HosterLink]
        // We flatten this to a list of available streams for the app
        const flattened = linksTable.flat(2); 

        flattened.forEach(link => {
            if (link && link.includes("http")) {
                // Mapping the masked domains from your KinogerExtractor code
                let cleanLink = link
                    .replace("kinoger.ru", "voe.sx")
                    .replace("kinoger.be", "vidhide.com")
                    .replace("kinoger.pw", "vidguard.to");

                finalLinks.push({
                    name: "Kinoger Mirror",
                    url: cleanLink,
                    type: "hls" // StreamerApp will attempt to resolve these iframes
                });
            }
        });

        return finalLinks;
    } catch (e) {
        return [];
    }
}
