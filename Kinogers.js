async function search(query) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
        const searchUrl = `https://kinoger.to{encodeURIComponent(query)}&x=0&y=0&submit=submit`;
        
        // Added a standard User-Agent header to avoid bot detection
        const response = await fetch(searchUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
            }
        });
        
        clearTimeout(id);
        const html = await response.text();
        
        const results = [];
        const regex = /<div class="titlecontrol">.*?<a href="(.*?)">(.*?)<\/a>/gs;
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[2].replace(" Film", "").trim(),
                url: match[1].startsWith('http') ? match[1] : `https://kinoger.to${match[1]}`,
                poster: "" 
            });
        }
        return results;
    } catch (e) {
        console.error("Search failed:", e);
        return []; // Return empty instead of hanging
    }
}
