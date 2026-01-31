async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        // Correct GET template from the OpenSearch XML
        const searchUrl = `https://kinoger.to{encodedKeyword}&do=search&subaction=search`;
        
        // Use fetchv2 as required by Sora/Luna documentation
        const response = await fetchv2(searchUrl);
        const html = await response.text();

        if (!html || html.length < 500) return JSON.stringify([]);

        const results = [];
        /** 
         * DLE Specific Regex: Targets the short-story container common in DataLife Engine
         * This captures the URL and the Title within the result block.
         */
        const regex = /<div class="short-story">[\s\S]*?<a href="([^"]+)">(.*?)<\/a>/g;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            let title = match[2].replace(/<[^>]*>?/gm, '').trim(); // Remove any HTML tags like <b> highlight

            if (title.length < 2 || title.includes("Passwort")) continue;

            results.push({
                title: title,
                image: "", // Kinoger search usually lacks direct images in this view
                href: href.startsWith('http') ? href : `https://kinoger.to${href.startsWith('/') ? '' : '/'}${href}`
            });
        }
        
        // Remove duplicates and return
        const finalResults = results.filter((v, i, a) => a.findIndex(t => (t.href === v.href)) === i);
        return JSON.stringify(finalResults);
    } catch (error) {
        return JSON.stringify([]);
    }
}
